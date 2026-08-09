import { ConfigService } from '@files/config/config.service';
import { FFmpegService } from '@files/services/ffmpeg/services/ffmpeg.service';
import { FilesPortraitBlurService } from '@files/services/files/blur/files-portrait-blur.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import type { Mock } from 'vitest';

const fsMock = vi.hoisted(() => ({
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn(),
}));
vi.mock('fs', () => ({ ...fsMock, default: fsMock }));
vi.mock('node:fs', () => ({ ...fsMock, default: fsMock }));

import * as fs from 'node:fs';

describe('FilesPortraitBlurService', () => {
  let service: FilesPortraitBlurService;
  let ffmpegService: { createPortraitWithBlur: Mock };
  let loggerService: { error: Mock; log: Mock };

  beforeEach(async () => {
    (fs.existsSync as Mock).mockReturnValue(true);
    ffmpegService = {
      createPortraitWithBlur: vi.fn().mockResolvedValue(undefined),
    };
    loggerService = { error: vi.fn(), log: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FilesPortraitBlurService,
        { provide: ConfigService, useValue: { get: vi.fn() } },
        { provide: LoggerService, useValue: loggerService },
        {
          provide: HttpService,
          useValue: { get: vi.fn(), post: vi.fn() },
        },
        { provide: FFmpegService, useValue: ffmpegService },
      ],
    }).compile();

    service = module.get<FilesPortraitBlurService>(FilesPortraitBlurService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('landscapeToPortrait', () => {
    it('generates a blurred portrait video and returns the output path', async () => {
      const result = await service.landscapeToPortrait(
        'videos',
        'ingredient-1',
        'source.mp4',
        { height: 1920, width: 1080 },
      );

      expect(ffmpegService.createPortraitWithBlur).toHaveBeenCalledWith(
        expect.stringContaining('source.mp4'),
        expect.stringContaining('portrait-blur.mp4'),
        { height: 1920, width: 1080 },
      );
      expect(result).toContain('portrait-blur.mp4');
    });

    it('defaults to 1080x1920 dimensions', async () => {
      await service.landscapeToPortrait('videos', 'ingredient-1', 'source.mp4');

      expect(ffmpegService.createPortraitWithBlur).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        { height: 1920, width: 1080 },
      );
    });

    it('logs and rethrows when ffmpeg fails', async () => {
      ffmpegService.createPortraitWithBlur.mockRejectedValueOnce(
        new Error('blur failed'),
      );

      await expect(
        service.landscapeToPortrait('videos', 'ingredient-1', 'source.mp4'),
      ).rejects.toThrow('blur failed');
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  describe('applyPortraitBlur', () => {
    it('uses default input type, video file, and dimensions', async () => {
      const result = await service.applyPortraitBlur(
        'https://example.com/video.mp4',
        'ingredient-1',
      );

      expect(ffmpegService.createPortraitWithBlur).toHaveBeenCalledWith(
        expect.stringContaining('input.mp4'),
        expect.any(String),
        { height: 1920, width: 1080 },
      );
      expect(result).toContain('portrait-blur.mp4');
    });

    it('uses provided options', async () => {
      await service.applyPortraitBlur(
        'https://example.com/video.mp4',
        'ingredient-1',
        {
          dimensions: { height: 1080, width: 1920 },
          inputType: 'clips',
          videoFile: 'custom.mp4',
        },
      );

      expect(ffmpegService.createPortraitWithBlur).toHaveBeenCalledWith(
        expect.stringContaining('custom.mp4'),
        expect.any(String),
        { height: 1080, width: 1920 },
      );
    });
  });
});
