import { FFmpegService } from '@files/services/ffmpeg/services/ffmpeg.service';
import { S3Service } from '@files/services/s3/s3.service';
import { VideoThumbnailService } from '@files/services/thumbnails/video-thumbnail.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import type { Mocked } from 'vitest';

describe('VideoThumbnailService', () => {
  let service: VideoThumbnailService;
  let ffmpegService: Mocked<FFmpegService>;
  let s3Service: Mocked<S3Service>;

  beforeEach(async () => {
    const mockFFmpegService = {
      cleanupTempFiles: vi.fn(),
      executeFFmpeg: vi.fn().mockResolvedValue(undefined),
      extractFrame: vi.fn().mockResolvedValue(undefined),
      getTempPath: vi.fn((type: string, id: string) => `/tmp/${type}-${id}`),
    };

    const mockS3Service = {
      downloadFile: vi.fn().mockResolvedValue(undefined),
      downloadFromUrl: vi.fn().mockResolvedValue(undefined),
      generateS3Key: vi.fn((type: string, id: string) => `${type}/${id}`),
      getPublicUrl: vi.fn(
        (key: string) => `https://bucket.s3.amazonaws.com/${key}`,
      ),
      uploadFile: vi.fn().mockResolvedValue({
        ETag: 'etag',
        Key: 'thumbnails/test-id.jpg',
        Location: 'https://bucket.s3.amazonaws.com/thumbnails/test-id.jpg',
      }),
    };

    const mockLoggerService: Mocked<LoggerService> = {
      debug: vi.fn(),
      error: vi.fn(),
      fatal: vi.fn(),
      isLevelEnabled: vi.fn(),
      log: vi.fn(),
      setContext: vi.fn(),
      setLogLevels: vi.fn(),
      verbose: vi.fn(),
      warn: vi.fn(),
    } as unknown as Mocked<LoggerService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VideoThumbnailService,
        {
          provide: FFmpegService,
          useValue: mockFFmpegService,
        },
        {
          provide: S3Service,
          useValue: mockS3Service,
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
      ],
    }).compile();

    service = module.get<VideoThumbnailService>(VideoThumbnailService);
    ffmpegService = module.get(FFmpegService);
    s3Service = module.get(S3Service);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateThumbnail', () => {
    it('should generate thumbnail from video URL', async () => {
      const videoUrl = 'https://example.com/video.mp4';
      const ingredientId = 'test-id';

      const thumbnailUrl = await service.generateThumbnail(
        videoUrl,
        ingredientId,
      );

      expect(s3Service.downloadFromUrl).toHaveBeenCalled();
      expect(ffmpegService.extractFrame).toHaveBeenCalled();
      expect(s3Service.uploadFile).toHaveBeenCalled();
      expect(thumbnailUrl).toContain('thumbnails/test-id.jpg');
    });

    it('should use custom timeInSeconds', async () => {
      const videoUrl = 'https://example.com/video.mp4';
      const ingredientId = 'test-id';
      const timeInSeconds = 2;

      await service.generateThumbnail(videoUrl, ingredientId, timeInSeconds);

      expect(ffmpegService.extractFrame).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        timeInSeconds,
      );
    });

    it('should use custom width', async () => {
      const videoUrl = 'https://example.com/video.mp4';
      const ingredientId = 'test-id';
      const width = 1280;

      await service.generateThumbnail(videoUrl, ingredientId, 1, width);

      expect(ffmpegService.executeFFmpeg).toHaveBeenCalledWith(
        expect.arrayContaining([expect.stringContaining(`scale=${width}`)]),
      );
    });
  });

  describe('generateThumbnailFromS3Key', () => {
    it('should generate thumbnail from S3 key', async () => {
      const s3Key = 'videos/test-id';
      const ingredientId = 'test-id';

      await service.generateThumbnailFromS3Key(s3Key, ingredientId);

      expect(s3Service.getPublicUrl).toHaveBeenCalledWith(s3Key);
      expect(s3Service.downloadFromUrl).toHaveBeenCalled();
    });
  });
});
