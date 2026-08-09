import { ConfigService } from '@files/config/config.service';
import { FFmpegService } from '@files/services/ffmpeg/services/ffmpeg.service';
import { FilesCaptionsService } from '@files/services/files/captions/files-captions.service';
import { FilesService } from '@files/services/files/files.service';
import { FilesGifService } from '@files/services/files/gif/files-gif.service';
import { FilesKenBurnsEffectService } from '@files/services/files/ken-burns/files-ken-burns-effect.service';
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

describe('FilesGifService', () => {
  let service: FilesGifService;
  let ffmpegService: { videoToGif: Mock };
  let loggerService: { error: Mock; log: Mock };

  beforeEach(async () => {
    (fs.existsSync as Mock).mockReturnValue(true);
    ffmpegService = { videoToGif: vi.fn().mockResolvedValue(undefined) };
    loggerService = { error: vi.fn(), log: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      imports: [],
      providers: [
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

      expect(ffmpegService.videoToGif).toHaveBeenCalledWith(
        expect.stringContaining('frame-0.mp4'),
        expect.stringContaining('ingredient-1.gif'),
        { fps: 10, width: 320 },
      );
      expect(result).toContain('ingredient-1.gif');
      expect(loggerService.log).toHaveBeenCalledWith('Started gif conversion');
    });

    it('logs and rethrows when ffmpeg fails', async () => {
      ffmpegService.videoToGif.mockRejectedValueOnce(new Error('gif failed'));

      await expect(service.videoToGif('ingredient-1')).rejects.toThrow(
        'gif failed',
      );
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  describe('createGif', () => {
    it('uses default width and fps when none are provided', async () => {
      const result = await service.createGif(
        'https://example.com/video.mp4',
        '/tmp/output.gif',
      );

      expect(ffmpegService.videoToGif).toHaveBeenCalledWith(
        'https://example.com/video.mp4',
        '/tmp/output.gif',
        { fps: 10, width: 320 },
      );
      expect(result).toBe('/tmp/output.gif');
    });

    it('uses provided width and fps options', async () => {
      await service.createGif(
        'https://example.com/video.mp4',
        '/tmp/output.gif',
        { fps: 24, width: 480 },
      );

      expect(ffmpegService.videoToGif).toHaveBeenCalledWith(
        'https://example.com/video.mp4',
        '/tmp/output.gif',
        { fps: 24, width: 480 },
      );
    });

    it('logs and rethrows when ffmpeg fails', async () => {
      ffmpegService.videoToGif.mockRejectedValueOnce(
        new Error('create failed'),
      );

      await expect(
        service.createGif('https://example.com/video.mp4', '/tmp/output.gif'),
      ).rejects.toThrow('create failed');
      expect(loggerService.error).toHaveBeenCalled();
    });
  });
});
