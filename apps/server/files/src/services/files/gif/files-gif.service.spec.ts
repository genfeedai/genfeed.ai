import { ConfigService } from '@files/config/config.service';
import { FFmpegService } from '@files/services/ffmpeg/services/ffmpeg.service';
import { FilesCaptionsService } from '@files/services/files/captions/files-captions.service';
import { FilesService } from '@files/services/files/files.service';
import { FilesGifService } from '@files/services/files/gif/files-gif.service';
import { FilesKenBurnsEffectService } from '@files/services/files/ken-burns/files-ken-burns-effect.service';
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

type GifConversion = {
  input: string;
  options: { fps: number; width: number };
  output: string;
};

describe('FilesGifService', () => {
  let service: FilesGifService;
  // Fake ffmpeg: records each conversion it ran, or fails the next one.
  let conversions: GifConversion[];
  let ffmpegFailure: Error | null;
  let loggedErrors: unknown[];

  beforeEach(async () => {
    (fs.existsSync as Mock).mockReturnValue(true);
    conversions = [];
    ffmpegFailure = null;
    loggedErrors = [];
    const ffmpegService = {
      videoToGif: async (
        input: string,
        output: string,
        options: GifConversion['options'],
      ) => {
        if (ffmpegFailure) throw ffmpegFailure;
        conversions.push({ input, options, output });
      },
    };
    const loggerService = {
      error: (...args: unknown[]) => {
        loggedErrors.push(args);
      },
      log: () => undefined,
    };

    const module: TestingModule = await Test.createTestingModule({
      imports: [],
      providers: [
        {
          provide: FileRuntimeSettingsService,
          useValue: { get: async () => ({ imageCompressionQuality: 50 }) },
        },
        FilesGifService,
        { provide: ConfigService, useValue: { get: vi.fn() } },
        { provide: LoggerService, useValue: loggerService },
        {
          provide: HttpService,
          useValue: { get: vi.fn(), post: vi.fn() },
        },
        { provide: FFmpegService, useValue: ffmpegService },
        { provide: FilesService, useValue: {} },
        { provide: FilesCaptionsService, useValue: {} },
        { provide: FilesKenBurnsEffectService, useValue: {} },
      ],
    }).compile();

    service = module.get<FilesGifService>(FilesGifService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('videoToGif', () => {
    it('converts the video frame to a gif and returns the output path', async () => {
      const result = await service.videoToGif('ingredient-1');

      expect(conversions).toEqual([
        {
          input: expect.stringContaining('frame-0.mp4'),
          options: { fps: 10, width: 320 },
          output: result,
        },
      ]);
      expect(result).toContain('ingredient-1.gif');
    });

    it('logs and rethrows when ffmpeg fails', async () => {
      ffmpegFailure = new Error('gif failed');

      await expect(service.videoToGif('ingredient-1')).rejects.toThrow(
        'gif failed',
      );
      expect(loggedErrors).toHaveLength(1);
    });
  });

  describe('createGif', () => {
    it('uses default width and fps when none are provided', async () => {
      const result = await service.createGif(
        'https://example.com/video.mp4',
        '/tmp/output.gif',
      );

      expect(conversions).toEqual([
        {
          input: 'https://example.com/video.mp4',
          options: { fps: 10, width: 320 },
          output: '/tmp/output.gif',
        },
      ]);
      expect(result).toBe('/tmp/output.gif');
    });

    it('uses provided width and fps options', async () => {
      await service.createGif(
        'https://example.com/video.mp4',
        '/tmp/output.gif',
        { fps: 24, width: 480 },
      );

      expect(conversions).toEqual([
        {
          input: 'https://example.com/video.mp4',
          options: { fps: 24, width: 480 },
          output: '/tmp/output.gif',
        },
      ]);
    });

    it('logs and rethrows when ffmpeg fails', async () => {
      ffmpegFailure = new Error('create failed');

      await expect(
        service.createGif('https://example.com/video.mp4', '/tmp/output.gif'),
      ).rejects.toThrow('create failed');
      expect(loggedErrors).toHaveLength(1);
    });
  });
});
