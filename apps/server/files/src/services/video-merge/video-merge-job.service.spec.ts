import { JOB_TYPES, type JobType } from '@files/queues/queue.constants';
import { VideoMergeJobService } from '@files/services/video-merge/video-merge-job.service';
import type { VideoJobData } from '@files/shared/interfaces/job.interface';
import { VideoTransition } from '@genfeedai/enums';
import type { Job } from 'bullmq';

const createJobData = (
  overrides: Partial<VideoJobData> = {},
): VideoJobData => ({
  authProviderUserId: 'auth-user-123',
  createdAt: new Date(),
  id: 'merge-job-data-123',
  ingredientId: 'ingredient-123',
  metadata: { websocketUrl: 'ws://localhost', ...overrides.metadata },
  organizationId: 'organization-123',
  params: { sourceIds: ['source-1', 'source-2'], ...overrides.params },
  room: 'user-room',
  type: JOB_TYPES.MERGE_VIDEOS as JobType,
  userId: 'user-123',
  ...overrides,
});

const createJob = (data: VideoJobData): Job<VideoJobData> =>
  ({
    data,
    id: 'job-123',
    name: JOB_TYPES.MERGE_VIDEOS,
  }) as unknown as Job<VideoJobData>;

describe('VideoMergeJobService', () => {
  const ffmpegService = {
    cleanupTempFiles: vi.fn(),
    convertToPortrait: vi.fn().mockResolvedValue(undefined),
    getTempPath: vi.fn(
      (type: string, ingredientId: string) => `/tmp/${type}-${ingredientId}`,
    ),
    mergeVideos: vi.fn().mockResolvedValue(undefined),
    mergeVideosWithMusic: vi.fn().mockResolvedValue(undefined),
    mergeVideosWithTransitions: vi.fn().mockResolvedValue(undefined),
  };
  const s3Service = {
    downloadFile: vi.fn().mockResolvedValue(undefined),
    generateS3Key: vi.fn((folder: string, id: string) => `${folder}/${id}.mp4`),
    getPublicUrl: vi.fn((key: string) => `https://cdn.example.com/${key}`),
    uploadFile: vi.fn().mockResolvedValue(undefined),
  };
  const webSocketService = {
    emitError: vi.fn(),
    emitProgress: vi.fn(),
    emitSuccess: vi.fn(),
  };
  const redisService = {
    publish: vi.fn().mockResolvedValue(1),
  };
  const logger = {
    error: vi.fn(),
  };
  let service: VideoMergeJobService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new VideoMergeJobService(
      ffmpegService as never,
      s3Service as never,
      webSocketService as never,
      redisService as never,
      logger as never,
    );
  });

  it('preserves the standard merge completion contract', async () => {
    const data = createJobData();

    const result = await service.process(createJob(data));

    expect(s3Service.downloadFile).toHaveBeenCalledTimes(2);
    expect(ffmpegService.mergeVideos).toHaveBeenCalledWith(
      expect.arrayContaining([
        '/tmp/merge-ingredient-123/input_0.mp4',
        '/tmp/merge-ingredient-123/input_1.mp4',
      ]),
      '/tmp/merge-ingredient-123/merged.mp4',
      undefined,
      expect.any(Function),
    );
    expect(s3Service.uploadFile).toHaveBeenCalledWith(
      'videos/ingredient-123.mp4',
      '/tmp/merge-ingredient-123/merged.mp4',
      'video/mp4',
    );
    expect(ffmpegService.cleanupTempFiles).toHaveBeenCalledWith(
      data.ingredientId,
      'merge',
    );
    expect(webSocketService.emitSuccess).toHaveBeenCalledWith(
      data.metadata.websocketUrl,
      {
        ingredientId: data.ingredientId,
        s3Key: 'videos/ingredient-123.mp4',
        url: 'https://cdn.example.com/videos/ingredient-123.mp4',
      },
      data.authProviderUserId,
      data.room,
    );
    expect(redisService.publish).toHaveBeenCalledWith(
      'background-task-update',
      expect.objectContaining({ status: 'completed' }),
    );
    expect(result).toEqual({
      outputPath: '/tmp/merge-ingredient-123/merged.mp4',
      s3Key: 'videos/ingredient-123.mp4',
      success: true,
    });
  });

  it('preserves music, progress, and resize orchestration', async () => {
    const data = createJobData({
      params: {
        height: 1920,
        isMuteVideoAudio: true,
        isResizeEnabled: true,
        music: 'music-123',
        musicVolume: 0.1,
        sourceIds: ['source-1', 'source-2'],
        width: 1080,
      },
    });
    ffmpegService.mergeVideosWithMusic.mockImplementationOnce(
      async (_inputs, _output, _options, onProgress) => {
        onProgress?.({ percent: 50 });
      },
    );

    const result = await service.process(createJob(data));

    expect(s3Service.downloadFile).toHaveBeenCalledTimes(3);
    expect(ffmpegService.mergeVideosWithMusic).toHaveBeenCalledWith(
      expect.any(Array),
      expect.any(String),
      {
        musicPath: '/tmp/merge-ingredient-123/music.mp3',
        musicVolume: 0.1,
        muteVideoAudio: true,
      },
      expect.any(Function),
    );
    expect(ffmpegService.convertToPortrait).toHaveBeenCalledWith(
      '/tmp/merge-ingredient-123/merged.mp4',
      '/tmp/merge-ingredient-123/resized.mp4',
      { height: 1920, width: 1080 },
      expect.any(Function),
    );
    expect(webSocketService.emitProgress).toHaveBeenCalledWith(
      data.metadata.websocketUrl,
      expect.objectContaining({
        currentStepLabel: 'Merging videos with music',
        percent: 62.5,
        step: 'merging',
        stepProgress: 50,
      }),
      data.authProviderUserId,
      data.room,
    );
    expect(result.outputPath).toBe('/tmp/merge-ingredient-123/resized.mp4');
  });

  it('falls back to transition-free merge when music download fails', async () => {
    const data = createJobData({
      params: {
        music: 'music-123',
        sourceIds: ['source-1'],
        transition: VideoTransition.NONE,
      },
    });
    s3Service.downloadFile
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Music not found'));

    await service.process(createJob(data));

    expect(ffmpegService.mergeVideos).toHaveBeenCalled();
    expect(ffmpegService.mergeVideosWithMusic).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to download music file: Music not found',
    );
  });

  it('preserves failure notification and propagation', async () => {
    const data = createJobData();
    ffmpegService.mergeVideos.mockRejectedValueOnce(new Error('Merge failed'));

    await expect(service.process(createJob(data))).rejects.toThrow(
      'Merge failed',
    );

    expect(webSocketService.emitError).toHaveBeenCalledWith(
      data.metadata.websocketUrl,
      'Merge failed',
      data.authProviderUserId,
      data.room,
    );
    expect(redisService.publish).toHaveBeenCalledWith(
      'background-task-update',
      expect.objectContaining({ error: 'Merge failed', status: 'failed' }),
    );
  });
});
