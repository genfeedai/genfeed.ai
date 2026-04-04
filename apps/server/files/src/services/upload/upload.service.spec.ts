import { ConfigService } from '@files/config/config.service';
import { FFmpegService } from '@files/services/ffmpeg/services/ffmpeg.service';
import { S3Service } from '@files/services/s3/s3.service';
import { UploadService } from '@files/services/upload/upload.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { HttpException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { of, throwError } from 'rxjs';
import type { Mock, Mocked } from 'vitest';

// Mock sharp
vi.mock('sharp', () => {
  const mockSharp = vi.fn().mockImplementation(() => ({
    jpeg: vi.fn().mockReturnThis(),
    metadata: vi.fn().mockResolvedValue({ height: 1080, width: 1920 }),
    png: vi.fn().mockReturnThis(),
    rotate: vi.fn().mockReturnThis(),
    toBuffer: vi.fn().mockResolvedValue(Buffer.from('processed-image')),
    webp: vi.fn().mockReturnThis(),
  }));
  return mockSharp;
});

// Mock fs
vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn().mockReturnValue(Buffer.from('file-content')),
  unlinkSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

import * as fs from 'node:fs';
import sharp from 'sharp';

describe('UploadService', () => {
  let service: UploadService;
  let mockConfigService: Mocked<ConfigService>;
  let mockFfmpegService: Mocked<FFmpegService>;
  let mockHttpService: Mocked<HttpService>;
  let mockLogger: Mocked<LoggerService>;
  let mockS3Service: Mocked<S3Service>;
  let mockSharpInstance: any;

  beforeEach(async () => {
    mockConfigService = {
      get: vi.fn().mockReturnValue('90'),
    } as unknown as Mocked<ConfigService>;

    mockFfmpegService = {
      getVideoMetadata: vi.fn().mockResolvedValue({
        format: { duration: 60 },
        streams: [
          { codec_type: 'video', height: 1080, width: 1920 },
          { codec_type: 'audio' },
        ],
      }),
    } as unknown as Mocked<FFmpegService>;

    mockHttpService = {
      get: vi.fn(),
    } as unknown as Mocked<HttpService>;

    mockLogger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as Mocked<LoggerService>;

    mockS3Service = {
      generateS3Key: vi.fn().mockReturnValue('ingredients/images/test-key'),
      getPublicUrl: vi.fn().mockReturnValue('https://s3.example.com/test-key'),
      uploadBuffer: vi.fn().mockResolvedValue(undefined),
    } as unknown as Mocked<S3Service>;

    // Reset sharp mock
    mockSharpInstance = {
      jpeg: vi.fn().mockReturnThis(),
      metadata: vi.fn().mockResolvedValue({ height: 1080, width: 1920 }),
      png: vi.fn().mockReturnThis(),
      rotate: vi.fn().mockReturnThis(),
      toBuffer: vi.fn().mockResolvedValue(Buffer.from('processed-image')),
      webp: vi.fn().mockReturnThis(),
    };
    (sharp as Mock).mockReturnValue(mockSharpInstance);

    // Reset fs mocks
    (fs.existsSync as Mock).mockReturnValue(true);
    (fs.readFileSync as Mock).mockReturnValue(Buffer.from('file-content'));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UploadService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: FFmpegService, useValue: mockFfmpegService },
        { provide: HttpService, useValue: mockHttpService },
        { provide: LoggerService, useValue: mockLogger },
        { provide: S3Service, useValue: mockS3Service },
      ],
    }).compile();

    service = module.get<UploadService>(UploadService);

    vi.clearAllMocks();
    (sharp as Mock).mockReturnValue(mockSharpInstance);
    (fs.existsSync as Mock).mockReturnValue(true);
    (fs.readFileSync as Mock).mockReturnValue(Buffer.from('file-content'));
  });

  describe('initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('uploadToS3 - file source', () => {
    it('should upload JPEG file with image dimensions', async () => {
      const result = await service.uploadToS3('test-key', 'images', {
        path: '/path/to/image.jpg',
        type: 'file',
      });

      expect(result.width).toBe(1920);
      expect(result.height).toBe(1080);
      expect(result.publicUrl).toBe('https://s3.example.com/test-key');
      expect(mockS3Service.uploadBuffer).toHaveBeenCalled();
    });

    it('should upload PNG file', async () => {
      await service.uploadToS3('test-key', 'images', {
        path: '/path/to/image.png',
        type: 'file',
      });

      expect(mockSharpInstance.png).toHaveBeenCalledWith({
        compressionLevel: 9,
        quality: 90,
      });
    });

    it('should upload WebP file', async () => {
      await service.uploadToS3('test-key', 'images', {
        path: '/path/to/image.webp',
        type: 'file',
      });

      expect(mockSharpInstance.webp).toHaveBeenCalledWith({ quality: 90 });
    });

    it('should upload MP4 video file with metadata', async () => {
      const result = await service.uploadToS3('test-key', 'videos', {
        path: '/path/to/video.mp4',
        type: 'file',
      });

      expect(result.width).toBe(1920);
      expect(result.height).toBe(1080);
      expect(result.duration).toBe(60);
      expect(result.hasAudio).toBe(true);
      expect(mockFfmpegService.getVideoMetadata).toHaveBeenCalled();
    });

    it('should handle video without audio stream', async () => {
      mockFfmpegService.getVideoMetadata.mockResolvedValue({
        format: { duration: 30 },
        streams: [{ codec_type: 'video', height: 1080, width: 1920 }],
      });

      const result = await service.uploadToS3('test-key', 'videos', {
        path: '/path/to/video.mp4',
        type: 'file',
      });

      expect(result.hasAudio).toBe(false);
    });

    it('should upload ZIP file without image processing', async () => {
      const result = await service.uploadToS3('test-key', 'archives', {
        path: '/path/to/archive.zip',
        type: 'file',
      });

      expect(result.publicUrl).toBe('https://s3.example.com/test-key');
      expect(sharp).not.toHaveBeenCalled();
    });

    it('should handle unknown file types as octet-stream', async () => {
      await service.uploadToS3('test-key', 'files', {
        path: '/path/to/file.unknown',
        type: 'file',
      });

      expect(mockS3Service.uploadBuffer).toHaveBeenCalled();
    });
  });

  describe('uploadToS3 - URL source', () => {
    it('should download and upload file from URL', async () => {
      mockHttpService.get.mockReturnValue(
        of({
          data: Buffer.from('downloaded-content'),
          headers: { 'content-type': 'image/jpeg' },
        } as any),
      );

      const result = await service.uploadToS3('test-key', 'images', {
        type: 'url',
        url: 'https://example.com/image.jpg',
      });

      expect(mockHttpService.get).toHaveBeenCalledWith(
        'https://example.com/image.jpg',
        expect.objectContaining({
          responseType: 'arraybuffer',
          timeout: 60000,
        }),
      );
      expect(result.publicUrl).toBe('https://s3.example.com/test-key');
    });

    it('should throw error for invalid URL', async () => {
      await expect(
        service.uploadToS3('test-key', 'images', {
          type: 'url',
          url: 'not-a-valid-url',
        }),
      ).rejects.toThrow(HttpException);
    });

    it('should throw error for empty URL', async () => {
      await expect(
        service.uploadToS3('test-key', 'images', {
          type: 'url',
          url: '',
        }),
      ).rejects.toThrow(HttpException);
    });

    it('should handle download errors', async () => {
      mockHttpService.get.mockReturnValue(
        throwError(() => new Error('Download failed')),
      );

      await expect(
        service.uploadToS3('test-key', 'images', {
          type: 'url',
          url: 'https://example.com/image.jpg',
        }),
      ).rejects.toThrow(HttpException);
    });

    it('should handle file size exceeded error', async () => {
      mockHttpService.get.mockReturnValue(
        throwError(() => ({ code: 'ERR_FR_MAX_BODY_LENGTH_EXCEEDED' })),
      );

      await expect(
        service.uploadToS3('test-key', 'images', {
          type: 'url',
          url: 'https://example.com/large-file.mp4',
        }),
      ).rejects.toThrow('File size exceeds 200MB limit');
    });

    it('should infer content type from URL extension', async () => {
      mockHttpService.get.mockReturnValue(
        of({
          data: Buffer.from('video-content'),
          headers: {},
        } as any),
      );

      // Need to setup tmp dir mock
      (fs.existsSync as Mock).mockReturnValue(true);

      await service.uploadToS3('test-key', 'videos', {
        type: 'url',
        url: 'https://example.com/video.mp4',
      });

      // Video type should be detected from URL
      expect(mockFfmpegService.getVideoMetadata).toHaveBeenCalled();
    });

    it('should handle ZIP files from URL', async () => {
      mockHttpService.get.mockReturnValue(
        of({
          data: Buffer.from('zip-content'),
          headers: {},
        } as any),
      );

      const result = await service.uploadToS3('test-key', 'archives', {
        type: 'url',
        url: 'https://example.com/archive.zip',
      });

      expect(result.publicUrl).toBe('https://s3.example.com/test-key');
    });
  });

  describe('uploadToS3 - base64 source', () => {
    it('should upload base64 image', async () => {
      const base64Data = Buffer.from('test-image').toString('base64');

      const result = await service.uploadToS3('test-key', 'images', {
        contentType: 'image/jpeg',
        data: base64Data,
        type: 'base64',
      });

      expect(result.publicUrl).toBe('https://s3.example.com/test-key');
      expect(result.width).toBe(1920);
      expect(result.height).toBe(1080);
    });

    it('should strip data URL prefix from base64', async () => {
      const base64Data = `data:image/jpeg;base64,${Buffer.from('test').toString('base64')}`;

      await service.uploadToS3('test-key', 'images', {
        contentType: 'image/jpeg',
        data: base64Data,
        type: 'base64',
      });

      expect(mockS3Service.uploadBuffer).toHaveBeenCalled();
    });

    it('should handle base64 video and extract metadata', async () => {
      const base64Data = Buffer.from('video-content').toString('base64');

      const result = await service.uploadToS3('test-key', 'videos', {
        contentType: 'video/mp4',
        data: base64Data,
        type: 'base64',
      });

      expect(result.duration).toBe(60);
      expect(result.hasAudio).toBe(true);
    });
  });

  describe('uploadToS3 - buffer source', () => {
    it('should upload buffer directly', async () => {
      const buffer = Buffer.from('image-data');

      const result = await service.uploadToS3('test-key', 'images', {
        contentType: 'image/jpeg',
        data: buffer,
        type: 'buffer',
      });

      expect(result.publicUrl).toBe('https://s3.example.com/test-key');
    });

    it('should process image buffer', async () => {
      const buffer = Buffer.from('image-data');

      await service.uploadToS3('test-key', 'images', {
        contentType: 'image/jpeg',
        data: buffer,
        type: 'buffer',
      });

      expect(mockSharpInstance.rotate).toHaveBeenCalled();
      expect(mockSharpInstance.jpeg).toHaveBeenCalled();
    });

    it('should extract video metadata from buffer', async () => {
      const buffer = Buffer.from('video-data');

      const result = await service.uploadToS3('test-key', 'videos', {
        contentType: 'video/mp4',
        data: buffer,
        type: 'buffer',
      });

      expect(result.width).toBe(1920);
      expect(result.height).toBe(1080);
    });
  });

  describe('uploadToS3 - error handling', () => {
    it('should throw error for invalid source type', async () => {
      await expect(
        service.uploadToS3('test-key', 'files', {
          type: 'invalid' as any,
        }),
      ).rejects.toThrow('Invalid upload source type');
    });

    it('should log error details on failure', async () => {
      mockS3Service.uploadBuffer.mockRejectedValue(new Error('S3 error'));

      await expect(
        service.uploadToS3('test-key', 'images', {
          path: '/path/to/image.jpg',
          type: 'file',
        }),
      ).rejects.toThrow('S3 error');

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('upload failed'),
        expect.objectContaining({
          key: 'test-key',
          type: 'images',
        }),
      );
    });
  });

  describe('uploadToS3 - image processing', () => {
    it('should auto-rotate images based on EXIF', async () => {
      await service.uploadToS3('test-key', 'images', {
        path: '/path/to/image.jpg',
        type: 'file',
      });

      expect(mockSharpInstance.rotate).toHaveBeenCalled();
    });

    it('should use configured compression quality', async () => {
      mockConfigService.get.mockReturnValue('85');

      await service.uploadToS3('test-key', 'images', {
        path: '/path/to/image.jpg',
        type: 'file',
      });

      expect(mockSharpInstance.jpeg).toHaveBeenCalledWith({ quality: 85 });
    });

    it('should default to 90 quality if not configured', async () => {
      mockConfigService.get.mockReturnValue(undefined);

      await service.uploadToS3('test-key', 'images', {
        path: '/path/to/image.jpg',
        type: 'file',
      });

      expect(mockSharpInstance.jpeg).toHaveBeenCalledWith({ quality: 90 });
    });
  });

  describe('uploadToS3 - logging', () => {
    it('should log upload start', async () => {
      await service.uploadToS3('test-key', 'images', {
        path: '/path/to/image.jpg',
        type: 'file',
      });

      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('starting upload'),
        expect.objectContaining({
          key: 'test-key',
          sourceType: 'file',
          type: 'images',
        }),
      );
    });

    it('should log upload completion with metrics', async () => {
      await service.uploadToS3('test-key', 'images', {
        path: '/path/to/image.jpg',
        type: 'file',
      });

      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('upload completed successfully'),
        expect.objectContaining({
          key: 'test-key',
          publicUrl: 'https://s3.example.com/test-key',
        }),
      );
    });
  });

  describe('uploadToS3 - return values', () => {
    it('should return complete metadata for images', async () => {
      const result = await service.uploadToS3('test-key', 'images', {
        path: '/path/to/image.jpg',
        type: 'file',
      });

      expect(result).toEqual(
        expect.objectContaining({
          height: expect.any(Number),
          publicUrl: expect.any(String),
          size: expect.any(Number),
          width: expect.any(Number),
        }),
      );
    });

    it('should return complete metadata for videos', async () => {
      const result = await service.uploadToS3('test-key', 'videos', {
        path: '/path/to/video.mp4',
        type: 'file',
      });

      expect(result).toEqual(
        expect.objectContaining({
          duration: expect.any(Number),
          hasAudio: expect.any(Boolean),
          height: expect.any(Number),
          publicUrl: expect.any(String),
          size: expect.any(Number),
          width: expect.any(Number),
        }),
      );
    });
  });
});
