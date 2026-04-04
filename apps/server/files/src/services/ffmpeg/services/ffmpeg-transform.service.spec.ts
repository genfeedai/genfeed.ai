import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@files/helpers/utils/security/security.util', () => ({
  SecurityUtil: {
    sanitizeCommandArgs: vi.fn((args: string[]) => args),
    validateFileExists: vi.fn().mockResolvedValue(undefined),
    validateFileExtension: vi.fn(),
    validateFilePath: vi.fn((p: string) => p),
    validateFileSize: vi.fn().mockResolvedValue(undefined),
    validateNumericParam: vi.fn((v: number) => v),
    validateStringParam: vi.fn((v: string) => v),
  },
}));

import { SecurityUtil } from '@files/helpers/utils/security/security.util';
import { FFmpegCoreService } from '@files/services/ffmpeg/services/ffmpeg-core.service';
import { FFmpegTransformService } from '@files/services/ffmpeg/services/ffmpeg-transform.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

describe('FFmpegTransformService', () => {
  let service: FFmpegTransformService;
  let mockCore: {
    executeFFmpeg: ReturnType<typeof vi.fn>;
    ensureOutputDir: ReturnType<typeof vi.fn>;
    cleanupTempFiles: ReturnType<typeof vi.fn>;
  };
  let mockLoggerService: {
    log: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    mockCore = {
      cleanupTempFiles: vi.fn().mockResolvedValue(undefined),
      ensureOutputDir: vi.fn().mockResolvedValue(undefined),
      executeFFmpeg: vi.fn().mockResolvedValue(undefined),
    };

    mockLoggerService = {
      error: vi.fn(),
      log: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FFmpegTransformService,
        { provide: FFmpegCoreService, useValue: mockCore },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile();

    service = module.get<FFmpegTransformService>(FFmpegTransformService);
  });

  describe('resizeVideo', () => {
    it('should call core.executeFFmpeg with scale filter args', async () => {
      await service.resizeVideo('/in/video.mp4', '/out/video.mp4', 1920, 1080);

      expect(mockCore.executeFFmpeg).toHaveBeenCalledWith(
        expect.arrayContaining([
          '-i',
          '/in/video.mp4',
          '-vf',
          expect.stringContaining('scale=1920:1080'),
          '-y',
          '/out/video.mp4',
        ]),
        undefined,
      );
    });

    it('should pass onProgress callback to executeFFmpeg', async () => {
      const onProgress = vi.fn();
      await service.resizeVideo(
        '/in/video.mp4',
        '/out/video.mp4',
        1280,
        720,
        onProgress,
      );

      expect(mockCore.executeFFmpeg).toHaveBeenCalledWith(
        expect.any(Array),
        onProgress,
      );
    });
  });

  describe('scaleVideo', () => {
    it('should call ensureOutputDir before executing', async () => {
      await service.scaleVideo('/in/video.mp4', '/out/scaled.mp4', {
        height: 720,
        width: 1280,
      });

      expect(mockCore.ensureOutputDir).toHaveBeenCalledWith('/out/scaled.mp4');
    });

    it('should use default codec options when not provided', async () => {
      await service.scaleVideo('/in/video.mp4', '/out/scaled.mp4', {
        height: 720,
        width: 1280,
      });

      expect(mockCore.executeFFmpeg).toHaveBeenCalledWith(
        expect.arrayContaining([
          '-c:v',
          'libx264',
          '-preset',
          'ultrafast',
          '-crf',
          '23',
          '-pix_fmt',
          'yuv420p',
        ]),
      );
    });

    it('should use custom codec options when provided', async () => {
      await service.scaleVideo(
        '/in/video.mp4',
        '/out/scaled.mp4',
        { height: 720, width: 1280 },
        { crf: '18', preset: 'slow', videoCodec: 'libx265' },
      );

      expect(mockCore.executeFFmpeg).toHaveBeenCalledWith(
        expect.arrayContaining([
          '-c:v',
          'libx265',
          '-preset',
          'slow',
          '-crf',
          '18',
        ]),
      );
    });
  });

  describe('trimVideo', () => {
    it('should call security validation before executing', async () => {
      await service.trimVideo('/in/video.mp4', '/out/trimmed.mp4', 5, 10);

      expect(SecurityUtil.validateFilePath).toHaveBeenCalledWith(
        '/in/video.mp4',
      );
      expect(SecurityUtil.validateFilePath).toHaveBeenCalledWith(
        '/out/trimmed.mp4',
      );
      expect(SecurityUtil.validateFileExtension).toHaveBeenCalled();
      expect(SecurityUtil.validateFileExists).toHaveBeenCalled();
    });

    it('should throw when startTime is negative', async () => {
      await expect(
        service.trimVideo('/in/video.mp4', '/out/trimmed.mp4', -1, 5),
      ).rejects.toThrow('Start time must be non-negative');
    });

    it('should throw when duration is zero or negative', async () => {
      await expect(
        service.trimVideo('/in/video.mp4', '/out/trimmed.mp4', 0, 0),
      ).rejects.toThrow('Duration must be positive');
    });

    it('should throw when duration is out of allowed range', async () => {
      await expect(
        service.trimVideo('/in/video.mp4', '/out/trimmed.mp4', 0, 20),
      ).rejects.toThrow('Duration must be between 2 and 15 seconds');
    });

    it('should pass valid args to executeFFmpeg', async () => {
      await service.trimVideo('/in/video.mp4', '/out/trimmed.mp4', 10, 5);

      expect(mockCore.executeFFmpeg).toHaveBeenCalledWith(
        expect.arrayContaining(['-ss', '10', '-t', '5']),
        undefined,
      );
    });
  });

  describe('compressVideo', () => {
    it('should return output path on success', async () => {
      const result = await service.compressVideo(
        '/in/video.mp4',
        '/out/compressed.mp4',
      );
      expect(result).toBe('/out/compressed.mp4');
    });

    it('should use default compression options', async () => {
      await service.compressVideo('/in/video.mp4', '/out/compressed.mp4');

      expect(mockCore.executeFFmpeg).toHaveBeenCalledWith(
        expect.arrayContaining([
          '-c:v',
          'libx264',
          '-preset',
          'medium',
          '-crf',
          '23',
          '-c:a',
          'aac',
          '-b:a',
          '128k',
        ]),
        undefined,
      );
    });

    it('should include video bitrate when specified', async () => {
      await service.compressVideo('/in/video.mp4', '/out/compressed.mp4', {
        videoBitrate: '2M',
      });

      expect(mockCore.executeFFmpeg).toHaveBeenCalledWith(
        expect.arrayContaining(['-b:v', '2M']),
        undefined,
      );
    });

    it('should not include -b:v when videoBitrate not set', async () => {
      await service.compressVideo('/in/video.mp4', '/out/compressed.mp4', {});

      const args = mockCore.executeFFmpeg.mock.calls[0][0];
      expect(args).not.toContain('-b:v');
    });
  });

  describe('convertToPortrait', () => {
    it('should use default 1080x1920 when dimensions not provided', async () => {
      await service.convertToPortrait('/in/video.mp4', '/out/portrait.mp4');

      expect(mockCore.executeFFmpeg).toHaveBeenCalledWith(
        expect.arrayContaining(['-vf', expect.stringContaining('1080:1920')]),
        undefined,
      );
    });

    it('should use custom dimensions when provided', async () => {
      await service.convertToPortrait('/in/video.mp4', '/out/portrait.mp4', {
        height: 2560,
        width: 1440,
      });

      expect(mockCore.executeFFmpeg).toHaveBeenCalledWith(
        expect.arrayContaining(['-vf', expect.stringContaining('1440:2560')]),
        undefined,
      );
    });

    it('should include crop filter with conditional expression (standard path)', async () => {
      await service.convertToPortrait('/in/video.mp4', '/out/portrait.mp4');

      const args = mockCore.executeFFmpeg.mock.calls[0][0] as string[];
      const vfIndex = args.indexOf('-vf');
      expect(vfIndex).toBeGreaterThanOrEqual(0);
      const vf = args[vfIndex + 1];
      // Conditional crop handles both landscape and ultra-narrow portrait
      expect(vf).toContain('crop=');
      expect(vf).toContain('if(lte(iw*16,ih*9)');
    });

    it('should include scale filter with force_original_aspect_ratio', async () => {
      await service.convertToPortrait('/in/video.mp4', '/out/portrait.mp4');

      const args = mockCore.executeFFmpeg.mock.calls[0][0] as string[];
      const vfIndex = args.indexOf('-vf');
      const vf = args[vfIndex + 1];
      expect(vf).toContain('force_original_aspect_ratio=decrease');
    });

    it('should include pad filter for letterbox (ultra-narrow path)', async () => {
      await service.convertToPortrait('/in/video.mp4', '/out/portrait.mp4');

      const args = mockCore.executeFFmpeg.mock.calls[0][0] as string[];
      const vfIndex = args.indexOf('-vf');
      const vf = args[vfIndex + 1];
      // pad filter adds black bars when needed (letterbox)
      expect(vf).toContain('pad=1080:1920');
    });

    it('should pass progress callback to executeFFmpeg', async () => {
      const onProgress = vi.fn();
      await service.convertToPortrait(
        '/in/video.mp4',
        '/out/portrait.mp4',
        undefined,
        onProgress,
      );

      expect(mockCore.executeFFmpeg).toHaveBeenCalledWith(
        expect.any(Array),
        onProgress,
      );
    });
  });

  describe('extractFrame', () => {
    it('should call executeFFmpeg with -vframes 1 for frame extraction', async () => {
      const result = await service.extractFrame(
        '/in/video.mp4',
        '/out/frame.jpg',
        30,
      );

      expect(mockCore.executeFFmpeg).toHaveBeenCalledWith(
        expect.arrayContaining([
          '-ss',
          '30',
          '-i',
          '/in/video.mp4',
          '-vframes',
          '1',
          '-y',
          '/out/frame.jpg',
        ]),
      );
      expect(result).toBe('/out/frame.jpg');
    });
  });

  describe('convertToGif', () => {
    it('should use default width and fps', async () => {
      await service.convertToGif('/in/video.mp4', '/out/video.gif');

      expect(mockCore.executeFFmpeg).toHaveBeenCalledWith(
        expect.arrayContaining([
          '-vf',
          expect.stringContaining('fps=10,scale=320'),
          '-c:v',
          'gif',
        ]),
        undefined,
      );
    });

    it('should use custom width and fps when provided', async () => {
      await service.convertToGif('/in/video.mp4', '/out/video.gif', {
        fps: 24,
        width: 640,
      });

      expect(mockCore.executeFFmpeg).toHaveBeenCalledWith(
        expect.arrayContaining([
          '-vf',
          expect.stringContaining('fps=24,scale=640'),
        ]),
        undefined,
      );
    });
  });
});
