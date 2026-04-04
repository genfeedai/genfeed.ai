import { writeFile } from 'node:fs/promises';
import { TaskProcessor } from '@files/processors/task.processor';
import type { TaskJobData } from '@files/queues/task-queue.service';
import type { FFmpegService } from '@files/services/ffmpeg/services/ffmpeg.service';
import type { S3Service } from '@files/services/s3/s3.service';
import type { WebSocketService } from '@files/services/websocket/websocket.service';
import type { LoggerService } from '@libs/logger/logger.service';
import type { Job } from 'bullmq';

vi.mock('node:fs/promises', () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

type MockJob = {
  id: string;
  data: TaskJobData;
  updateProgress: ReturnType<typeof vi.fn>;
};

const createJob = (data: TaskJobData): MockJob => ({
  data,
  id: 'job-1',
  updateProgress: vi.fn().mockResolvedValue(undefined),
});

const createJobData = (overrides?: Partial<TaskJobData>): TaskJobData => ({
  assetId: 'asset-1',
  config: {
    captionContent: '1\n00:00:00,000 --> 00:00:03,000\nHello world',
    s3Key: 'videos/input.mp4',
  },
  metadata: { websocketUrl: '/ws/caption' },
  organizationId: 'org-1',
  taskId: 'task-1',
  userId: 'user-1',
  ...overrides,
});

describe('TaskProcessor', () => {
  let processor: TaskProcessor;
  let ffmpegService: {
    addCaptions: ReturnType<typeof vi.fn>;
    cleanupTempFiles: ReturnType<typeof vi.fn>;
    getTempPath: ReturnType<typeof vi.fn>;
  };
  let s3Service: {
    downloadFile: ReturnType<typeof vi.fn>;
    generateS3Key: ReturnType<typeof vi.fn>;
    getPublicUrl: ReturnType<typeof vi.fn>;
    uploadFile: ReturnType<typeof vi.fn>;
  };
  let websocketService: {
    emitError: ReturnType<typeof vi.fn>;
    emitProgress: ReturnType<typeof vi.fn>;
    emitSuccess: ReturnType<typeof vi.fn>;
  };
  let logger: {
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    ffmpegService = {
      addCaptions: vi.fn().mockResolvedValue(undefined),
      cleanupTempFiles: vi.fn(),
      getTempPath: vi.fn().mockReturnValue('/workspace/temp/caption/asset-1'),
    };
    s3Service = {
      downloadFile: vi.fn().mockResolvedValue(undefined),
      generateS3Key: vi.fn().mockReturnValue('captioned/asset-1.mp4'),
      getPublicUrl: vi
        .fn()
        .mockReturnValue('https://cdn.genfeed.ai/captioned/asset-1.mp4'),
      uploadFile: vi.fn().mockResolvedValue(undefined),
    };
    websocketService = {
      emitError: vi.fn(),
      emitProgress: vi.fn(),
      emitSuccess: vi.fn(),
    };
    logger = {
      error: vi.fn(),
      log: vi.fn(),
    };

    processor = new TaskProcessor(
      ffmpegService as unknown as FFmpegService,
      s3Service as unknown as S3Service,
      websocketService as unknown as WebSocketService,
      logger as unknown as LoggerService,
    );
  });

  it('adds captions to media using ffmpeg addCaptions flow', async () => {
    const job = createJob(createJobData());

    const result = await processor.handleCaption(
      job as unknown as Job<TaskJobData>,
    );

    expect(writeFile).toHaveBeenCalledWith(
      '/workspace/temp/caption/asset-1/captions.srt',
      '1\n00:00:00,000 --> 00:00:03,000\nHello world',
      'utf8',
    );
    expect(ffmpegService.addCaptions).toHaveBeenCalled();
    expect(s3Service.uploadFile).toHaveBeenCalledWith(
      'captioned/asset-1.mp4',
      '/workspace/temp/caption/asset-1/output.mp4',
      'video/mp4',
    );
    expect(websocketService.emitSuccess).toHaveBeenCalled();
    expect(result).toEqual(
      expect.objectContaining({
        assetId: 'asset-1',
        s3Key: 'captioned/asset-1.mp4',
        success: true,
      }),
    );
  });

  it('fails early when caption content is missing', async () => {
    const job = createJob(
      createJobData({
        config: {
          captionContent: '   ',
          s3Key: 'videos/input.mp4',
        },
      }),
    );

    await expect(
      processor.handleCaption(job as unknown as Job<TaskJobData>),
    ).rejects.toThrow(
      'Caption content is required for caption-media processing',
    );
    expect(ffmpegService.addCaptions).not.toHaveBeenCalled();
    expect(websocketService.emitError).toHaveBeenCalled();
  });
});
