import { ConfigService } from '@files/config/config.service';
import { FFmpegService } from '@files/services/ffmpeg/services/ffmpeg.service';
import { FilesPortraitBlurService } from '@files/services/files/blur/files-portrait-blur.service';
import { FileRuntimeSettingsService } from '@files/services/runtime-settings/file-runtime-settings.service';
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

type PortraitRender = {
  dimensions: { height: number; width: number };
  input: string;
  output: string;
};

describe('FilesPortraitBlurService', () => {
  let service: FilesPortraitBlurService;
  // Fake ffmpeg: records each portrait render it ran, or fails the next one.
  let renders: PortraitRender[];
  let ffmpegFailure: Error | null;
  let loggedErrors: unknown[];

  beforeEach(async () => {
    (fs.existsSync as Mock).mockReturnValue(true);
    renders = [];
    ffmpegFailure = null;
    loggedErrors = [];
    const ffmpegService = {
      createPortraitWithBlur: async (
        input: string,
        output: string,
        dimensions: PortraitRender['dimensions'],
      ) => {
        if (ffmpegFailure) throw ffmpegFailure;
        renders.push({ dimensions, input, output });
      },
    };
    const loggerService = {
      error: (...args: unknown[]) => {
        loggedErrors.push(args);
      },
      log: () => undefined,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: FileRuntimeSettingsService,
          useValue: { get: async () => ({ imageCompressionQuality: 50 }) },
        },
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

      expect(renders).toEqual([
        {
          dimensions: { height: 1920, width: 1080 },
          input: expect.stringContaining('source.mp4'),
          output: result,
        },
      ]);
      expect(result).toContain('portrait-blur.mp4');
    });

    it('defaults to 1080x1920 dimensions', async () => {
      await service.landscapeToPortrait('videos', 'ingredient-1', 'source.mp4');

      expect(renders).toEqual([
        expect.objectContaining({ dimensions: { height: 1920, width: 1080 } }),
      ]);
    });

    it('logs and rethrows when ffmpeg fails', async () => {
      ffmpegFailure = new Error('blur failed');

      await expect(
        service.landscapeToPortrait('videos', 'ingredient-1', 'source.mp4'),
      ).rejects.toThrow('blur failed');
      expect(loggedErrors).toHaveLength(1);
    });
  });

  describe('applyPortraitBlur', () => {
    it('uses default input type, video file, and dimensions', async () => {
      const result = await service.applyPortraitBlur(
        'https://example.com/video.mp4',
        'ingredient-1',
      );

      expect(renders).toEqual([
        {
          dimensions: { height: 1920, width: 1080 },
          input: expect.stringContaining('input.mp4'),
          output: result,
        },
      ]);
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

      expect(renders).toEqual([
        expect.objectContaining({
          dimensions: { height: 1080, width: 1920 },
          input: expect.stringContaining('custom.mp4'),
        }),
      ]);
    });
  });
});
