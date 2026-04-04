import { MediaUploadService } from '@api/endpoints/webhooks/services/media-upload.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('MediaUploadService', () => {
  let service: MediaUploadService;
  let filesClientService: Record<string, ReturnType<typeof vi.fn>>;
  let metadataService: { patch: ReturnType<typeof vi.fn> };
  let loggerService: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    filesClientService = {
      uploadToS3: vi.fn(),
    };
    metadataService = {
      patch: vi.fn(),
    };
    loggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    service = new MediaUploadService(
      filesClientService,
      metadataService,
      loggerService,
    );
  });

  describe('uploadAndUpdateMetadata', () => {
    it('should upload to S3 with correct plural path', async () => {
      filesClientService.uploadToS3.mockResolvedValue({
        duration: 10,
        hasAudio: true,
        height: 720,
        size: 1024,
        width: 1280,
      });

      await service.uploadAndUpdateMetadata(
        'ing-123',
        'video',
        'http://example.com/video.mp4',
        'meta-1',
      );

      expect(filesClientService.uploadToS3).toHaveBeenCalledWith(
        'ing-123',
        'videos',
        { type: 'url', url: 'http://example.com/video.mp4' },
      );
    });

    it('should update metadata with valid dimensions', async () => {
      filesClientService.uploadToS3.mockResolvedValue({
        duration: 10,
        hasAudio: true,
        height: 720,
        size: 1024,
        width: 1280,
      });

      await service.uploadAndUpdateMetadata(
        'ing-123',
        'video',
        'url',
        'meta-1',
      );

      expect(metadataService.patch).toHaveBeenCalledWith('meta-1', {
        duration: 10,
        hasAudio: true,
        height: 720,
        size: 1024,
        width: 1280,
      });
    });

    it('should exclude zero dimensions from update', async () => {
      filesClientService.uploadToS3.mockResolvedValue({
        duration: 5,
        hasAudio: false,
        height: 0,
        size: 512,
        width: 0,
      });

      await service.uploadAndUpdateMetadata(
        'ing-123',
        'image',
        'url',
        'meta-1',
      );

      expect(metadataService.patch).toHaveBeenCalledWith('meta-1', {
        duration: 5,
        hasAudio: false,
        size: 512,
      });
    });

    it('should log warning when dimensions are missing', async () => {
      filesClientService.uploadToS3.mockResolvedValue({
        height: 0,
        size: 512,
        width: 0,
      });

      await service.uploadAndUpdateMetadata(
        'ing-123',
        'video',
        'url',
        'meta-1',
        'ext-id',
      );

      expect(loggerService.warn).toHaveBeenCalled();
    });
  });
});
