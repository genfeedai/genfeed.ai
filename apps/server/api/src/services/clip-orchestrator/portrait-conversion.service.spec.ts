import type { ConfigService } from '@api/config/config.service';
import {
  type ConversionResult,
  INSTAGRAM_PORTRAIT,
  PortraitConversionService,
} from '@api/services/clip-orchestrator/portrait-conversion.service';
import type { FilesClientService } from '@api/services/files-microservice/client/files-client.service';
import type { FileQueueService } from '@api/services/files-microservice/queue/file-queue.service';
import type { ReplicateService } from '@api/services/integrations/replicate/replicate.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const createLogger = (): Record<
  keyof Pick<
    LoggerService,
    'debug' | 'error' | 'log' | 'warn' | 'verbose' | 'setContext'
  >,
  ReturnType<typeof vi.fn>
> => ({
  debug: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
  setContext: vi.fn(),
  verbose: vi.fn(),
  warn: vi.fn(),
});

const createReplicateService = (): {
  runModel: ReturnType<typeof vi.fn>;
  getPrediction: ReturnType<typeof vi.fn>;
} => ({
  getPrediction: vi.fn(),
  runModel: vi.fn(),
});

const createFileQueueService = (): {
  convertToPortrait: ReturnType<typeof vi.fn>;
  waitForJob: ReturnType<typeof vi.fn>;
} => ({
  convertToPortrait: vi.fn(),
  waitForJob: vi.fn(),
});

const createFilesClientService = (): {
  getPresignedDownloadUrl: ReturnType<typeof vi.fn>;
} => ({
  getPresignedDownloadUrl: vi.fn(),
});

const createConfigService = (): {
  get: ReturnType<typeof vi.fn>;
} => ({
  get: vi.fn(),
});

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('PortraitConversionService', () => {
  let service: PortraitConversionService;
  let logger: ReturnType<typeof createLogger>;
  let replicateService: ReturnType<typeof createReplicateService>;
  let fileQueueService: ReturnType<typeof createFileQueueService>;
  let filesClientService: ReturnType<typeof createFilesClientService>;
  let configService: ReturnType<typeof createConfigService>;

  beforeEach(() => {
    logger = createLogger();
    replicateService = createReplicateService();
    fileQueueService = createFileQueueService();
    filesClientService = createFilesClientService();
    configService = createConfigService();

    configService.get.mockReturnValue('https://cdn.genfeed.ai');
    filesClientService.getPresignedDownloadUrl.mockResolvedValue(
      'https://s3.example.com/videos/video-1.mp4',
    );

    service = new PortraitConversionService(
      logger as unknown as LoggerService,
      replicateService as unknown as ReplicateService,
      fileQueueService as unknown as FileQueueService,
      filesClientService as unknown as FilesClientService,
      configService as unknown as ConfigService,
    );

    vi.spyOn(
      service as unknown as { sleep: () => Promise<void> },
      'sleep',
    ).mockResolvedValue(undefined);
  });

  // -----------------------------------------------------------------------
  // lumaReframe — success
  // -----------------------------------------------------------------------

  it('lumaReframe should call Replicate and return output on success', async () => {
    replicateService.runModel.mockResolvedValue('pred-123');
    replicateService.getPrediction.mockResolvedValue({
      output: ['https://replicate.delivery/reframed.mp4'],
      status: 'succeeded',
    });

    const result = await service.lumaReframe('video-1', 30_000);

    expect(replicateService.runModel).toHaveBeenCalledWith(
      'zsxkib/luma-reframe',
      {
        aspect_ratio: '9:16',
        video_url: 'https://s3.example.com/videos/video-1.mp4',
      },
    );
    expect(result.method).toBe('luma-reframe');
    expect(result.videoUrl).toBe('https://replicate.delivery/reframed.mp4');
    expect(result.width).toBe(INSTAGRAM_PORTRAIT.WIDTH);
    expect(result.height).toBe(INSTAGRAM_PORTRAIT.HEIGHT);
  });

  it('lumaReframe should handle string output (non-array)', async () => {
    replicateService.runModel.mockResolvedValue('pred-456');
    replicateService.getPrediction.mockResolvedValue({
      output: 'https://replicate.delivery/single.mp4',
      status: 'succeeded',
    });

    const result = await service.lumaReframe('video-2', 30_000);

    expect(result.videoUrl).toBe('https://replicate.delivery/single.mp4');
  });

  // -----------------------------------------------------------------------
  // lumaReframe — timeout
  // -----------------------------------------------------------------------

  it('lumaReframe should throw on timeout', async () => {
    replicateService.runModel.mockResolvedValue('pred-timeout');
    replicateService.getPrediction.mockResolvedValue({
      status: 'processing',
    });

    await expect(service.lumaReframe('video-3', 1)).rejects.toThrow(
      /timed out/i,
    );
  });

  // -----------------------------------------------------------------------
  // lumaReframe — API error / failure
  // -----------------------------------------------------------------------

  it('lumaReframe should throw when prediction fails', async () => {
    replicateService.runModel.mockResolvedValue('pred-fail');
    replicateService.getPrediction.mockResolvedValue({
      error: 'Model crashed',
      status: 'failed',
    });

    await expect(service.lumaReframe('video-4', 30_000)).rejects.toThrow(
      'Model crashed',
    );
  });

  it('lumaReframe should throw when runModel rejects', async () => {
    replicateService.runModel.mockRejectedValue(new Error('Replicate 503'));

    await expect(service.lumaReframe('video-5', 30_000)).rejects.toThrow(
      'Replicate 503',
    );
  });

  // -----------------------------------------------------------------------
  // resizeFallback — success
  // -----------------------------------------------------------------------

  it('resizeFallback should enqueue job and return CDN URL on success', async () => {
    fileQueueService.convertToPortrait.mockResolvedValue({
      jobId: 'job-100',
      status: 'waiting',
    });
    fileQueueService.waitForJob.mockResolvedValue({
      s3Key: 'videos/video-6_portrait.mp4',
      success: true,
    });

    const result = await service.resizeFallback('video-6');

    expect(fileQueueService.convertToPortrait).toHaveBeenCalledWith(
      'video-6',
      'https://s3.example.com/videos/video-1.mp4',
      { height: 1920, width: 1080 },
    );
    expect(fileQueueService.waitForJob).toHaveBeenCalledWith(
      'job-100',
      120_000,
    );
    expect(result.method).toBe('resize-fallback');
    expect(result.videoUrl).toBe(
      'https://cdn.genfeed.ai/videos/video-6_portrait.mp4',
    );
    expect(result.width).toBe(INSTAGRAM_PORTRAIT.WIDTH);
    expect(result.height).toBe(INSTAGRAM_PORTRAIT.HEIGHT);
  });

  // -----------------------------------------------------------------------
  // resizeFallback — error
  // -----------------------------------------------------------------------

  it('resizeFallback should throw when job fails', async () => {
    fileQueueService.convertToPortrait.mockResolvedValue({
      jobId: 'job-101',
      status: 'waiting',
    });
    fileQueueService.waitForJob.mockRejectedValue(new Error('Job failed'));

    await expect(service.resizeFallback('video-7')).rejects.toThrow(
      'Job failed',
    );
  });

  it('resizeFallback should throw when result has no s3Key', async () => {
    fileQueueService.convertToPortrait.mockResolvedValue({
      jobId: 'job-102',
      status: 'waiting',
    });
    fileQueueService.waitForJob.mockResolvedValue({ success: true });

    await expect(service.resizeFallback('video-8')).rejects.toThrow(
      /no s3Key/i,
    );
  });

  // -----------------------------------------------------------------------
  // convertToPortrait — integration
  // -----------------------------------------------------------------------

  it('convertToPortrait should use Luma reframe by default', async () => {
    replicateService.runModel.mockResolvedValue('pred-ok');
    replicateService.getPrediction.mockResolvedValue({
      output: ['https://replicate.delivery/ok.mp4'],
      status: 'succeeded',
    });

    const result = await service.convertToPortrait('video-9');

    expect(result.method).toBe('luma-reframe');
    expect(result.width).toBe(INSTAGRAM_PORTRAIT.WIDTH);
    expect(result.height).toBe(INSTAGRAM_PORTRAIT.HEIGHT);
  });

  it('convertToPortrait should use resize fallback when forceFallback is true', async () => {
    fileQueueService.convertToPortrait.mockResolvedValue({
      jobId: 'job-200',
      status: 'waiting',
    });
    fileQueueService.waitForJob.mockResolvedValue({
      s3Key: 'videos/video-10_portrait.mp4',
      success: true,
    });

    const result = await service.convertToPortrait('video-10', {
      forceFallback: true,
    });

    expect(result.method).toBe('resize-fallback');
    expect(replicateService.runModel).not.toHaveBeenCalled();
  });

  it('convertToPortrait should fall back to resize when Luma throws', async () => {
    replicateService.runModel.mockRejectedValue(new Error('Luma API 503'));
    fileQueueService.convertToPortrait.mockResolvedValue({
      jobId: 'job-201',
      status: 'waiting',
    });
    fileQueueService.waitForJob.mockResolvedValue({
      s3Key: 'videos/video-11_portrait.mp4',
      success: true,
    });

    const result = await service.convertToPortrait('video-11');

    expect(result.method).toBe('resize-fallback');
    expect(logger.warn).toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Error handling
  // -----------------------------------------------------------------------

  it('should throw when videoId is empty', async () => {
    await expect(service.convertToPortrait('')).rejects.toThrow(
      'videoId is required',
    );
  });

  // -----------------------------------------------------------------------
  // validateResult
  // -----------------------------------------------------------------------

  it('should validate a correct result as valid', () => {
    const result: ConversionResult = {
      height: 1920,
      method: 'luma-reframe',
      videoUrl: 'https://cdn.genfeed.ai/video.mp4',
      width: 1080,
    };

    const validation = service.validateResult(result);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  it('should flag incorrect dimensions', () => {
    const result: ConversionResult = {
      height: 1080,
      method: 'resize-fallback',
      videoUrl: 'https://cdn.genfeed.ai/video.mp4',
      width: 1920,
    };

    const validation = service.validateResult(result);
    expect(validation.valid).toBe(false);
    expect(validation.errors).toHaveLength(2);
    expect(validation.errors[0]).toContain('Width');
    expect(validation.errors[1]).toContain('Height');
  });

  it('should flag missing videoUrl', () => {
    const result: ConversionResult = {
      height: 1920,
      method: 'luma-reframe',
      videoUrl: '',
      width: 1080,
    };

    const validation = service.validateResult(result);
    expect(validation.valid).toBe(false);
    expect(validation.errors).toContain('videoUrl is required');
  });
});
