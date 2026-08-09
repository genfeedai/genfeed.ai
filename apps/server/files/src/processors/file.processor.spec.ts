import { FileProcessor } from '@files/processors/file.processor';
import type { FileJobData } from '@files/shared/interfaces/job.interface';
import type { Job } from 'bullmq';
import { of, throwError } from 'rxjs';

vi.mock('node:fs', () => ({
  default: {
    writeFileSync: vi.fn(),
  },
  writeFileSync: vi.fn(),
}));

vi.mock('sharp', () => ({
  default: vi.fn(() => ({
    jpeg: vi.fn().mockReturnThis(),
    resize: vi.fn().mockReturnThis(),
    rotate: vi.fn().mockReturnThis(),
    toFile: vi.fn().mockResolvedValue(undefined),
  })),
}));

import * as fs from 'node:fs';

function createMockJob(name: string, data: FileJobData): Job<FileJobData> {
  return {
    data,
    id: 'job-1',
    name,
    updateProgress: vi.fn().mockResolvedValue(undefined),
  } as unknown as Job<FileJobData>;
}

function createJobData(overrides: Partial<FileJobData> = {}): FileJobData {
  return {
    authProviderUserId: 'auth-user-1',
    createdAt: new Date(),
    id: 'job-data-1',
    ingredientId: 'ingredient-1',
    metadata: { websocketUrl: 'ws://localhost' },
    organizationId: 'org-1',
    params: {},
    room: 'room-1',
    type: 'download-file',
    userId: 'user-1',
    ...overrides,
  } as FileJobData;
}

describe('FileProcessor', () => {
  let processor: FileProcessor;
  let configService: {
    ingredientsEndpoint: string;
    get: ReturnType<typeof vi.fn>;
  };
  let ffmpegService: {
    getTempPath: ReturnType<typeof vi.fn>;
    cleanupTempFiles: ReturnType<typeof vi.fn>;
    addTextOverlay: ReturnType<typeof vi.fn>;
  };
  let httpService: { get: ReturnType<typeof vi.fn> };
  let logger: {
    log: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };
  let s3Service: {
    generateS3Key: ReturnType<typeof vi.fn>;
    uploadFile: ReturnType<typeof vi.fn>;
  };
  let websocketService: { sendProgress: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();

    configService = {
      get: vi.fn(),
      ingredientsEndpoint: 'https://api.example.com/ingredients',
    };
    ffmpegService = {
      addTextOverlay: vi.fn().mockResolvedValue(undefined),
      cleanupTempFiles: vi.fn().mockResolvedValue(undefined),
      getTempPath: vi.fn((type: string, id: string) => `/tmp/${type}-${id}`),
    };
    httpService = {
      get: vi.fn().mockReturnValue(
        of({
          data: Buffer.from('file-data'),
        }),
      ),
    };
    logger = { error: vi.fn(), log: vi.fn() };
    s3Service = {
      generateS3Key: vi.fn((type: string, id: string) => `${type}/${id}`),
      uploadFile: vi.fn().mockResolvedValue({
        ETag: 'etag',
        Key: 'files/ingredient-1',
        Location: 'https://s3.amazonaws.com/files/ingredient-1',
      }),
    };
    websocketService = { sendProgress: vi.fn() };

    processor = new FileProcessor(
      configService as never,
      ffmpegService as never,
      httpService as never,
      logger as never,
      s3Service as never,
      websocketService as never,
    );
  });

  describe('process', () => {
    it('routes download-file jobs to handleDownloadFile', async () => {
      const job = createMockJob(
        'download-file',
        createJobData({ params: { url: 'https://example.com/a.bin' } }),
      );

      const result = await processor.process(job);

      expect(result).toMatchObject({ success: true });
    });

    it('routes prepare-all-files jobs to handlePrepareFiles', async () => {
      const job = createMockJob(
        'prepare-all-files',
        createJobData({ params: { frames: [] } }),
      );

      const result = await processor.process(job);

      expect(result).toMatchObject({ success: true });
    });

    it('routes cleanup-temp-files jobs to handleCleanupFiles', async () => {
      const job = createMockJob('cleanup-temp-files', createJobData());

      const result = await processor.process(job);

      expect(result).toMatchObject({ success: true });
    });

    it('routes upload-to-s3 jobs to handleUploadToS3', async () => {
      const job = createMockJob(
        'upload-to-s3',
        createJobData({ params: { filePath: '/tmp/output/a.mp4' } }),
      );

      const result = await processor.process(job);

      expect(result).toMatchObject({ success: true });
    });

    it('throws for unknown job names', async () => {
      const job = createMockJob('unknown-job', createJobData());

      await expect(processor.process(job)).rejects.toThrow(
        'Unknown file job type: unknown-job',
      );
    });
  });

  describe('handleDownloadFile', () => {
    it('downloads a binary file and writes it with fs.writeFileSync', async () => {
      const job = createMockJob(
        'download-file',
        createJobData({
          params: {
            index: 0,
            type: 'voices',
            url: 'https://example.com/a.mp3',
          },
        }),
      );

      const result = await processor.handleDownloadFile(job);

      expect(httpService.get).toHaveBeenCalledWith(
        'https://example.com/a.mp3',
        expect.objectContaining({ responseType: 'arraybuffer' }),
      );
      expect(fs.writeFileSync).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.outputPath).toContain('voices-ingredient-1');
    });

    it('routes image downloads through sharp instead of writeFileSync', async () => {
      const job = createMockJob(
        'download-file',
        createJobData({
          params: {
            index: 0,
            type: 'images',
            url: 'https://example.com/a.jpg',
          },
        }),
      );

      const result = await processor.handleDownloadFile(job);

      expect(result.success).toBe(true);
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('reports download progress via updateProgress', async () => {
      const job = createMockJob(
        'download-file',
        createJobData({
          params: {
            index: 0,
            type: 'voices',
            url: 'https://example.com/a.mp3',
          },
        }),
      );

      await processor.handleDownloadFile(job);

      expect(job.updateProgress).toHaveBeenCalled();
      expect(websocketService.sendProgress).toHaveBeenCalled();
    });

    it('logs and rethrows when the download fails', async () => {
      httpService.get.mockReturnValue(
        throwError(() => new Error('network down')),
      );
      const job = createMockJob(
        'download-file',
        createJobData({
          params: { url: 'https://example.com/a.mp3' },
        }),
      );

      await expect(processor.handleDownloadFile(job)).rejects.toThrow(
        'network down',
      );
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('handlePrepareFiles', () => {
    it('downloads images, voices, and background music from frames', async () => {
      const job = createMockJob(
        'prepare-all-files',
        createJobData({
          params: {
            frames: [
              {
                duration: 3,
                image: 'img-1',
                overlayText: 'hello',
                voice: 'voice-1',
                voiceText: 'hello there',
              },
            ],
            musicId: 'music-1',
          },
        }),
      );

      const result = await processor.handlePrepareFiles(job);

      expect(result.success).toBe(true);
      expect(httpService.get).toHaveBeenCalled();
    });

    it('downloads image-to-videos instead of images when present', async () => {
      const job = createMockJob(
        'prepare-all-files',
        createJobData({
          params: {
            frames: [
              {
                duration: 3,
                imageToVideo: 'clip-1',
                voiceText: 'hi',
              },
            ],
          },
        }),
      );

      const result = await processor.handlePrepareFiles(job);

      expect(result.success).toBe(true);
    });

    it('logs and rethrows when preparation fails', async () => {
      httpService.get.mockReturnValue(throwError(() => new Error('boom')));
      const job = createMockJob(
        'prepare-all-files',
        createJobData({
          params: {
            frames: [{ duration: 1, image: 'img-1', voiceText: 'hi' }],
          },
        }),
      );

      await expect(processor.handlePrepareFiles(job)).rejects.toThrow('boom');
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('handleCleanupFiles', () => {
    it('cleans up the default temp directories', async () => {
      const job = createMockJob('cleanup-temp-files', createJobData());

      const result = await processor.handleCleanupFiles(job);

      expect(result.success).toBe(true);
      expect(ffmpegService.cleanupTempFiles).toHaveBeenCalledWith(
        'ingredient-1',
        'clips',
      );
    });

    it('also cleans the output directory when requested', async () => {
      const job = createMockJob(
        'cleanup-temp-files',
        createJobData({ params: { isDeleteOutputEnabled: true } }),
      );

      await processor.handleCleanupFiles(job);

      expect(ffmpegService.cleanupTempFiles).toHaveBeenCalledWith(
        'ingredient-1',
        'output',
      );
    });

    it('does not throw and returns success: false on cleanup failure', async () => {
      ffmpegService.cleanupTempFiles.mockRejectedValueOnce(new Error('locked'));
      const job = createMockJob('cleanup-temp-files', createJobData());

      const result = await processor.handleCleanupFiles(job);

      expect(result.success).toBe(false);
      expect(result.error).toBe('locked');
    });
  });

  describe('handleUploadToS3', () => {
    it('uploads the file and returns the resulting location', async () => {
      const job = createMockJob(
        'upload-to-s3',
        createJobData({
          params: { filePath: '/tmp/output/a.mp4' },
        }),
      );

      const result = await processor.handleUploadToS3(job);

      expect(s3Service.uploadFile).toHaveBeenCalledWith(
        'files/ingredient-1',
        '/tmp/output/a.mp4',
        'video/mp4',
      );
      expect(result.success).toBe(true);
      expect(result.outputPath).toBe(
        'https://s3.amazonaws.com/files/ingredient-1',
      );
    });

    it('prefers an explicit s3Key and contentType from params', async () => {
      const job = createMockJob(
        'upload-to-s3',
        createJobData({
          params: {
            contentType: 'image/png',
            filePath: '/tmp/output/a.png',
            s3Key: 'custom/key.png',
          },
        }),
      );

      await processor.handleUploadToS3(job);

      expect(s3Service.uploadFile).toHaveBeenCalledWith(
        'custom/key.png',
        '/tmp/output/a.png',
        'image/png',
      );
    });

    it('logs and rethrows when the upload fails', async () => {
      s3Service.uploadFile.mockRejectedValueOnce(new Error('s3 down'));
      const job = createMockJob(
        'upload-to-s3',
        createJobData({ params: { filePath: '/tmp/output/a.mp4' } }),
      );

      await expect(processor.handleUploadToS3(job)).rejects.toThrow('s3 down');
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('handleAddWatermark', () => {
    it('adds a text overlay watermark and returns the output path', async () => {
      const job = createMockJob(
        'add-watermark',
        createJobData({ params: { filePath: '/tmp/output/a.mp4' } }),
      );

      const result = await processor.handleAddWatermark(job);

      expect(ffmpegService.addTextOverlay).toHaveBeenCalledWith(
        '/tmp/output/a.mp4',
        '/tmp/output/a_watermark.mp4',
        '@genfeedai',
        { position: 'bottom' },
        expect.any(Function),
      );
      expect(result.success).toBe(true);
    });

    it('uses a custom watermark text when provided', async () => {
      const job = createMockJob(
        'add-watermark',
        createJobData({
          params: { filePath: '/tmp/output/a.mp4', watermarkText: 'MyBrand' },
        }),
      );

      await processor.handleAddWatermark(job);

      expect(ffmpegService.addTextOverlay).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        'MyBrand',
        expect.any(Object),
        expect.any(Function),
      );
    });

    it('logs and rethrows when watermarking fails', async () => {
      ffmpegService.addTextOverlay.mockRejectedValueOnce(
        new Error('ffmpeg failed'),
      );
      const job = createMockJob(
        'add-watermark',
        createJobData({ params: { filePath: '/tmp/output/a.mp4' } }),
      );

      await expect(processor.handleAddWatermark(job)).rejects.toThrow(
        'ffmpeg failed',
      );
    });
  });

  describe('handleCreateClips', () => {
    it('returns a success result with the clips temp path', async () => {
      const job = createMockJob('create-clips', createJobData());

      const result = await processor.handleCreateClips(job);

      expect(result.success).toBe(true);
      expect(ffmpegService.getTempPath).toHaveBeenCalledWith(
        'clips',
        'ingredient-1',
      );
    });
  });

  describe('handleAddCaptionsOverlay', () => {
    it('returns a success result with the output temp path', async () => {
      const job = createMockJob('add-captions-overlay', createJobData());

      const result = await processor.handleAddCaptionsOverlay(job);

      expect(result.success).toBe(true);
      expect(ffmpegService.getTempPath).toHaveBeenCalledWith(
        'output',
        'ingredient-1',
      );
    });
  });
});
