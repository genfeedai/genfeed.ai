import { VideoMergeJobService } from '@files/services/video-merge/video-merge-job.service';
import type { VideoJobData } from '@files/shared/interfaces/job.interface';
import { VideoTransition } from '@genfeedai/contracts';
import {
  FILE_JOB_TYPES as JOB_TYPES,
  type FileJobType as JobType,
} from '@genfeedai/contracts/queue';
import type { Job } from 'bullmq';

const createJobData = (
  overrides: Partial<VideoJobData> = {},
): VideoJobData => ({
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  id: 'merge-job-123',
  ingredientId: 'ingredient-123',
  metadata: { websocketUrl: '/ws/videos' },
  organizationId: 'organization-123',
  params: { sourceIds: ['source-1', 'source-2'] },
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
    probe: vi.fn().mockResolvedValue({
      format: { duration: '6', size: '100' },
      streams: [{ codec_type: 'video', width: 64, height: 64 }],
    }),
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
    downloadFromUrl: vi.fn().mockResolvedValue(undefined),
    getPresignedDownloadUrlForStoredKey: vi
      .fn()
      .mockImplementation(
        async (key: string) =>
          `https://s3.example/${encodeURIComponent(key)}?Signature=fresh`,
      ),
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

  const activatedService = () =>
    new VideoMergeJobService(
      ffmpegService as never,
      s3Service as never,
      webSocketService as never,
      redisService as never,
      logger as never,
      { isAuthorizedMediaDeliveryEnabled: true } as never,
    );

  it('uses supplied canonical source and music keys and returns the actual random output object when activated', async () => {
    s3Service.uploadFile.mockResolvedValueOnce({
      Key: 'ingredients/videos/actual-merged-object',
    });
    const result = await activatedService().process(
      createJob(
        createJobData({
          params: {
            sourceIds: ['source-1'],
            sourceStorageKeys: ['ingredients/videos/random-source'],
            music: 'music-1',
            musicStorageKey: 'ingredients/musics/random-track',
          },
        }),
      ),
    );
    expect(s3Service.getPresignedDownloadUrlForStoredKey).toHaveBeenCalledWith(
      'ingredients/videos/random-source',
      300,
    );
    expect(s3Service.getPresignedDownloadUrlForStoredKey).toHaveBeenCalledWith(
      'ingredients/musics/random-track',
      300,
    );
    expect(s3Service.generateS3Key).toHaveBeenCalledTimes(1);
    expect(s3Service.generateS3Key).toHaveBeenCalledWith(
      'videos',
      expect.stringMatching(/^[a-f0-9-]{36}$/),
    );
    expect(result.s3Key).toBe('ingredients/videos/actual-merged-object');
  });

  it('fails before downloading when activated source keys are absent', async () => {
    await expect(
      activatedService().process(createJob(createJobData())),
    ).rejects.toThrow('canonical source storage keys');
    expect(s3Service.downloadFile).not.toHaveBeenCalled();
    expect(s3Service.uploadFile).not.toHaveBeenCalled();
  });

  it('fails instead of reconstructing a selected music object from its ID when activated', async () => {
    await expect(
      activatedService().process(
        createJob(
          createJobData({
            params: {
              sourceIds: ['source-1'],
              sourceStorageKeys: ['ingredients/videos/random-source'],
              music: 'music-1',
            },
          }),
        ),
      ),
    ).rejects.toThrow('canonical music storage key');
    expect(s3Service.generateS3Key).not.toHaveBeenCalled();
    expect(s3Service.uploadFile).not.toHaveBeenCalled();
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
      '/tmp/merge-ingredient-123/input_0.mp4',
      '/tmp/merge-ingredient-123/input_1.mp4',
    );
    expect(webSocketService.emitSuccess).toHaveBeenCalledWith(
      data.metadata.websocketUrl,
      {
        ingredientId: data.ingredientId,
        s3Key: 'videos/ingredient-123.mp4',
        url: 'https://cdn.example.com/videos/ingredient-123.mp4',
      },
      data.userId,
      data.room,
    );
    expect(redisService.publish).toHaveBeenCalledWith(
      'background-task-update',
      expect.objectContaining({ status: 'completed' }),
    );
    expect(result).toEqual({
      outputPath: '/tmp/merge-ingredient-123/merged.mp4',
      duration: 6,
      size: 100,
      width: 64,
      height: 64,
      url: 'https://cdn.example.com/videos/ingredient-123.mp4',
      s3Key: 'videos/ingredient-123.mp4',
      success: true,
    });
  });

  it('downloads ordered persisted keys instead of guessing extensions', async () => {
    const result = await service.process(
      createJob(
        createJobData({
          params: {
            sourceIds: ['source-1', 'source-2'],
            isPersistedOutputOnly: true,
            sourceStorageKeys: [
              'ingredients/videos/source-1.mp4',
              'ingredients/videos/nested/source-2.webm',
            ],
          },
        }),
      ),
    );
    expect(s3Service.downloadFile.mock.calls.map((call) => call[0])).toEqual([
      'ingredients/videos/source-1.mp4',
      'ingredients/videos/nested/source-2.webm',
    ]);
    expect(result.outputPath).toBeUndefined();
    expect(ffmpegService.cleanupTempFiles).toHaveBeenCalledWith(
      '/tmp/merge-ingredient-123/input_0.mp4',
      '/tmp/merge-ingredient-123/input_1.mp4',
      '/tmp/merge-ingredient-123/merged.mp4',
    );
  });
  it.each(['ingredients/videos/../secret', 'ingredients/audios/secret.wav'])(
    'rejects unsafe source key %s before download',
    async (key) => {
      await expect(
        service.process(
          createJob(
            createJobData({
              params: {
                sourceIds: ['source-1', 'source-2'],
                sourceStorageKeys: [key, 'ingredients/videos/ok.mp4'],
              },
            }),
          ),
        ),
      ).rejects.toThrow();
      expect(s3Service.downloadFile).not.toHaveBeenCalled();
    },
  );

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
      data.userId,
      data.room,
    );
    expect(result.outputPath).toBe('/tmp/merge-ingredient-123/resized.mp4');
    expect(result.url).toBe(
      'https://cdn.example.com/videos/ingredient-123.mp4',
    );
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

  it('mutes clip audio in a plain merge without music', async () => {
    const data = createJobData();
    data.params.isMuteVideoAudio = true;

    await service.process(createJob(data));

    expect(ffmpegService.mergeVideos).toHaveBeenCalledWith(
      expect.any(Array),
      '/tmp/merge-ingredient-123/merged.mp4',
      { muteVideoAudio: true },
      expect.any(Function),
    );
  });

  it('mutes clip audio in a transition merge without music', async () => {
    const data = createJobData();
    data.params.isMuteVideoAudio = true;
    data.params.transition = VideoTransition.FADE;
    data.params.transitionDuration = 0.5;

    await service.process(createJob(data));

    expect(ffmpegService.mergeVideosWithTransitions).toHaveBeenCalledWith(
      expect.any(Array),
      '/tmp/merge-ingredient-123/merged.mp4',
      expect.objectContaining({ muteVideoAudio: true, transition: 'fade' }),
      expect.any(Function),
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
      data.userId,
      data.room,
    );
    expect(redisService.publish).toHaveBeenCalledWith(
      'background-task-update',
      expect.objectContaining({ error: 'Merge failed', status: 'failed' }),
    );
  });

  it('signs exact whitespace and reserved-character video and music keys before bounded downloads', async () => {
    const videoKey = 'ingredients/videos/clip %2F?#.mp4';
    const musicKey = 'ingredients/musics/track %2F?#.wav';
    s3Service.uploadFile.mockResolvedValueOnce({
      Key: 'ingredients/videos/random-output.mp4',
    });
    await activatedService().process(
      createJob(
        createJobData({
          params: {
            sourceIds: ['source-1'],
            sourceStorageKeys: [videoKey],
            music: 'music-1',
            musicStorageKey: musicKey,
          },
        }),
      ),
    );
    expect(s3Service.getPresignedDownloadUrlForStoredKey.mock.calls).toEqual([
      [videoKey, 300],
      [musicKey, 300],
    ]);
    expect(
      s3Service.downloadFromUrl.mock.calls.map((call) => [call[0], call[2]]),
    ).toEqual([
      [
        `https://s3.example/${encodeURIComponent(videoKey)}?Signature=fresh`,
        1024 * 1024 * 1024,
      ],
      [
        `https://s3.example/${encodeURIComponent(musicKey)}?Signature=fresh`,
        1024 * 1024 * 1024,
      ],
    ]);
    expect(s3Service.downloadFile).not.toHaveBeenCalled();
  });

  it.each([
    'ingredients/videos/../secret',
    'ingredients/audios/foreign.wav',
    'ingredients/videos/bad\\key.mp4',
  ])(
    'rejects invalid active canonical source %s before signing or fetching',
    async (key) => {
      await expect(
        activatedService().process(
          createJob(
            createJobData({
              params: { sourceIds: ['source-1'], sourceStorageKeys: [key] },
            }),
          ),
        ),
      ).rejects.toThrow();
      expect(
        s3Service.getPresignedDownloadUrlForStoredKey,
      ).not.toHaveBeenCalled();
      expect(s3Service.downloadFromUrl).not.toHaveBeenCalled();
    },
  );
});
