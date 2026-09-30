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
    getVideoMetadata: ReturnType<typeof vi.fn>;
    resizeVideo: ReturnType<typeof vi.fn>;
    trimVideo: ReturnType<typeof vi.fn>;
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
      addCaptions: vi
        .fn()
        .mockImplementation(
          async (
            _input: string,
            _output: string,
            _captions: string,
            onProgress?: (progress: { percent: number }) => void,
          ) => {
            onProgress?.({ percent: 50 });
          },
        ),
      cleanupTempFiles: vi.fn(),
      getTempPath: vi.fn().mockReturnValue('/workspace/temp/caption/asset-1'),
      getVideoMetadata: vi
        .fn()
        .mockResolvedValue({ format: { duration: '30' } }),
      resizeVideo: vi
        .fn()
        .mockImplementation(
          async (
            _input: string,
            _output: string,
            _width: number,
            _height: number,
            onProgress?: (progress: { percent: number }) => void,
          ) => {
            onProgress?.({ percent: 50 });
          },
        ),
      trimVideo: vi
        .fn()
        .mockImplementation(
          async (
            _input: string,
            _output: string,
            _start: number,
            _duration: number,
            onProgress?: (progress: { percent: number }) => void,
          ) => {
            onProgress?.({ percent: 50 });
          },
        ),
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

  describe('process', () => {
    it('routes transform-media jobs to handleTransform', async () => {
      const job = createJob(
        createJobData({
          config: { orientation: 'landscape', s3Key: 'videos/input.mp4' },
        }),
      );
      (job as unknown as { name: string }).name = 'transform-media';

      const result = await processor.process(
        job as unknown as Job<TaskJobData>,
      );

      expect(result.success).toBe(true);
    });

    it('routes upscale-media jobs to handleUpscale', async () => {
      const job = createJob(
        createJobData({
          config: { resolution: '1080p', s3Key: 'videos/input.mp4' },
        }),
      );
      (job as unknown as { name: string }).name = 'upscale-media';

      const result = await processor.process(
        job as unknown as Job<TaskJobData>,
      );

      expect(result.success).toBe(true);
    });

    it('routes caption-media jobs to handleCaption', async () => {
      const job = createJob(createJobData());
      (job as unknown as { name: string }).name = 'caption-media';

      const result = await processor.process(
        job as unknown as Job<TaskJobData>,
      );

      expect(result.success).toBe(true);
    });

    it('routes resize-media jobs to handleResize', async () => {
      const job = createJob(
        createJobData({
          config: { height: 720, s3Key: 'videos/input.mp4', width: 1280 },
        }),
      );
      (job as unknown as { name: string }).name = 'resize-media';

      const result = await processor.process(
        job as unknown as Job<TaskJobData>,
      );

      expect(result.success).toBe(true);
    });

    it('routes clip-media jobs to handleClip', async () => {
      const job = createJob(
        createJobData({
          config: { count: 2, duration: 5, s3Key: 'videos/input.mp4' },
        }),
      );
      (job as unknown as { name: string }).name = 'clip-media';

      const result = await processor.process(
        job as unknown as Job<TaskJobData>,
      );

      expect(result.success).toBe(true);
    });

    it('throws for unknown job names', async () => {
      const job = createJob(createJobData());
      (job as unknown as { name: string }).name = 'unknown-task';

      await expect(
        processor.process(job as unknown as Job<TaskJobData>),
      ).rejects.toThrow('Unknown task job type: unknown-task');
    });
  });

  describe('handleCaption', () => {
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

    it('propagates ffmpeg errors and emits a websocket error', async () => {
      ffmpegService.addCaptions.mockRejectedValueOnce(new Error('ffmpeg boom'));
      const job = createJob(createJobData());

      await expect(
        processor.handleCaption(job as unknown as Job<TaskJobData>),
      ).rejects.toThrow('ffmpeg boom');
      expect(websocketService.emitError).toHaveBeenCalledWith(
        '/ws/caption',
        'ffmpeg boom',
      );
    });

    it('skips the S3 download when no s3Key is configured', async () => {
      const job = createJob(
        createJobData({
          config: { captionContent: 'hi' },
          metadata: {},
        }),
      );

      await processor.handleCaption(job as unknown as Job<TaskJobData>);

      expect(s3Service.downloadFile).not.toHaveBeenCalled();
      expect(websocketService.emitSuccess).not.toHaveBeenCalled();
    });
  });

  describe('handleTransform', () => {
    it('resizes to portrait dimensions and uploads the result', async () => {
      const job = createJob(
        createJobData({
          config: {
            aspectRatio: '9:16',
            orientation: 'portrait',
            s3Key: 'videos/input.mp4',
          },
        }),
      );

      const result = await processor.handleTransform(
        job as unknown as Job<TaskJobData>,
      );

      expect(s3Service.downloadFile).toHaveBeenCalled();
      expect(ffmpegService.resizeVideo).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        1920,
        1080,
        expect.any(Function),
      );
      expect(result.success).toBe(true);
      expect(websocketService.emitSuccess).toHaveBeenCalled();
    });

    it('resizes to a square when orientation is square', async () => {
      const job = createJob(
        createJobData({
          config: { orientation: 'square', s3Key: 'videos/input.mp4' },
        }),
      );

      await processor.handleTransform(job as unknown as Job<TaskJobData>);

      expect(ffmpegService.resizeVideo).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        1080,
        1080,
        expect.any(Function),
      );
    });

    it('propagates errors and emits a websocket error', async () => {
      ffmpegService.resizeVideo.mockRejectedValueOnce(
        new Error('resize failed'),
      );
      const job = createJob(
        createJobData({
          config: { orientation: 'landscape', s3Key: 'videos/input.mp4' },
        }),
      );

      await expect(
        processor.handleTransform(job as unknown as Job<TaskJobData>),
      ).rejects.toThrow('resize failed');
      expect(websocketService.emitError).toHaveBeenCalled();
    });
  });

  describe('handleUpscale', () => {
    it('maps a known resolution label to target dimensions', async () => {
      const job = createJob(
        createJobData({
          config: { resolution: '4k', s3Key: 'videos/input.mp4' },
        }),
      );

      const result = await processor.handleUpscale(
        job as unknown as Job<TaskJobData>,
      );

      expect(ffmpegService.resizeVideo).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        3840,
        2160,
        expect.any(Function),
      );
      expect(result.success).toBe(true);
    });

    it('falls back to 1080p for an unknown resolution label', async () => {
      const job = createJob(
        createJobData({
          config: { resolution: 'unknown', s3Key: 'videos/input.mp4' },
        }),
      );

      await processor.handleUpscale(job as unknown as Job<TaskJobData>);

      expect(ffmpegService.resizeVideo).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        1920,
        1080,
        expect.any(Function),
      );
    });

    it('propagates errors and emits a websocket error', async () => {
      ffmpegService.resizeVideo.mockRejectedValueOnce(
        new Error('upscale failed'),
      );
      const job = createJob(
        createJobData({
          config: { resolution: '1080p', s3Key: 'videos/input.mp4' },
        }),
      );

      await expect(
        processor.handleUpscale(job as unknown as Job<TaskJobData>),
      ).rejects.toThrow('upscale failed');
      expect(websocketService.emitError).toHaveBeenCalled();
    });
  });

  describe('handleResize', () => {
    it('resizes to the requested width and height', async () => {
      const job = createJob(
        createJobData({
          config: { height: 720, s3Key: 'videos/input.mp4', width: 1280 },
        }),
      );

      const result = await processor.handleResize(
        job as unknown as Job<TaskJobData>,
      );

      expect(ffmpegService.resizeVideo).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        1280,
        720,
        expect.any(Function),
      );
      expect(result.success).toBe(true);
    });

    it('defaults to 1920x1080 when no dimensions are provided', async () => {
      const job = createJob(
        createJobData({ config: { s3Key: 'videos/input.mp4' } }),
      );

      await processor.handleResize(job as unknown as Job<TaskJobData>);

      expect(ffmpegService.resizeVideo).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        1920,
        1080,
        expect.any(Function),
      );
    });

    it('propagates errors and emits a websocket error', async () => {
      ffmpegService.resizeVideo.mockRejectedValueOnce(
        new Error('resize failed'),
      );
      const job = createJob(
        createJobData({ config: { s3Key: 'videos/input.mp4' } }),
      );

      await expect(
        processor.handleResize(job as unknown as Job<TaskJobData>),
      ).rejects.toThrow('resize failed');
      expect(websocketService.emitError).toHaveBeenCalled();
    });
  });

  describe('handleClip', () => {
    it('trims and uploads the requested number of clips', async () => {
      const job = createJob(
        createJobData({
          config: { count: 2, duration: 5, s3Key: 'videos/input.mp4' },
        }),
      );

      const result = await processor.handleClip(
        job as unknown as Job<TaskJobData>,
      );

      expect(ffmpegService.getVideoMetadata).toHaveBeenCalled();
      expect(ffmpegService.trimVideo).toHaveBeenCalledTimes(2);
      expect(s3Service.uploadFile).toHaveBeenCalledTimes(2);
      expect(result.success).toBe(true);
      expect((result as unknown as { clips: unknown[] }).clips).toHaveLength(2);
    });

    it('uses default duration/count and a 60s fallback duration', async () => {
      ffmpegService.getVideoMetadata.mockResolvedValueOnce({
        format: { duration: '0' },
      });
      const job = createJob(
        createJobData({ config: { s3Key: 'videos/input.mp4' } }),
      );

      const result = await processor.handleClip(
        job as unknown as Job<TaskJobData>,
      );

      expect(ffmpegService.trimVideo).toHaveBeenCalledTimes(3);
      expect(result.success).toBe(true);
    });

    it('propagates errors and emits a websocket error', async () => {
      ffmpegService.trimVideo.mockRejectedValueOnce(new Error('trim failed'));
      const job = createJob(
        createJobData({
          config: { count: 1, s3Key: 'videos/input.mp4' },
        }),
      );

      await expect(
        processor.handleClip(job as unknown as Job<TaskJobData>),
      ).rejects.toThrow('trim failed');
      expect(websocketService.emitError).toHaveBeenCalled();
    });
  });
});
