import { ConfigService } from '@files/config/config.service';
import { FFmpegService } from '@files/services/ffmpeg/services/ffmpeg.service';
import { FilesSplitScreenService } from '@files/services/files/split/files-split-screen.service';
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

describe('FilesSplitScreenService', () => {
  let service: FilesSplitScreenService;
  let ffmpegService: { createVerticalSplitScreen: Mock };
  let loggerService: { error: Mock; log: Mock };

  beforeEach(async () => {
    (fs.existsSync as Mock).mockReturnValue(true);
    ffmpegService = {
      createVerticalSplitScreen: vi.fn().mockResolvedValue(undefined),
    };
    loggerService = { error: vi.fn(), log: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FilesSplitScreenService,
        { provide: ConfigService, useValue: { get: vi.fn() } },
        { provide: LoggerService, useValue: loggerService },
        {
          provide: HttpService,
          useValue: { get: vi.fn(), post: vi.fn() },
        },
        { provide: FFmpegService, useValue: ffmpegService },
      ],
    }).compile();

    service = module.get<FilesSplitScreenService>(FilesSplitScreenService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateSplitScreen', () => {
    it('creates a vertical split screen and returns the output path', async () => {
      const result = await service.generateSplitScreen(
        'ingredient-1',
        'top.mp4',
        'bottom.mp4',
        { height: 1920, width: 1080 },
      );

      expect(ffmpegService.createVerticalSplitScreen).toHaveBeenCalledWith(
        expect.stringContaining('top.mp4'),
        expect.stringContaining('bottom.mp4'),
        expect.stringContaining('split.mp4'),
        { height: 1920, width: 1080 },
      );
      expect(result).toContain('split.mp4');
    });

    it('logs and rethrows when ffmpeg fails', async () => {
      ffmpegService.createVerticalSplitScreen.mockRejectedValueOnce(
        new Error('split failed'),
      );

      await expect(
        service.generateSplitScreen('ingredient-1', 'top.mp4', 'bottom.mp4', {
          height: 1920,
          width: 1080,
        }),
      ).rejects.toThrow('split failed');
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  describe('createSplitScreenVideo', () => {
    it('uses default clips and dimensions when none are provided', async () => {
      const result = await service.createSplitScreenVideo([], 'ingredient-1');

      expect(ffmpegService.createVerticalSplitScreen).toHaveBeenCalledWith(
        expect.stringContaining('clip-0.mp4'),
        expect.stringContaining('clip-1.mp4'),
        expect.any(String),
        { height: 1920, width: 1080 },
      );
      expect(result).toContain('split.mp4');
    });

    it('uses custom clips and dimensions from options', async () => {
      await service.createSplitScreenVideo([], 'ingredient-1', {
        bottomClip: 'custom-bottom.mp4',
        dimensions: { height: 1080, width: 1920 },
        topClip: 'custom-top.mp4',
      });

      expect(ffmpegService.createVerticalSplitScreen).toHaveBeenCalledWith(
        expect.stringContaining('custom-top.mp4'),
        expect.stringContaining('custom-bottom.mp4'),
        expect.any(String),
        { height: 1080, width: 1920 },
      );
    });
  });
});
