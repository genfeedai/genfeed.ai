import { FFmpegService } from '@files/services/ffmpeg/services/ffmpeg.service';
import { FilesCaptionsService } from '@files/services/files/captions/files-captions.service';
import { FilesService } from '@files/services/files/files.service';
import { FilesKenBurnsEffectService } from '@files/services/files/ken-burns/files-ken-burns-effect.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import type { Mock } from 'vitest';

const fsMock = vi.hoisted(() => ({
  existsSync: vi.fn().mockReturnValue(false),
  readdirSync: vi.fn().mockReturnValue([]),
  readFileSync: vi.fn().mockReturnValue(''),
}));
vi.mock('fs', () => ({ ...fsMock, default: fsMock }));
vi.mock('node:fs', () => ({ ...fsMock, default: fsMock }));

import * as fs from 'node:fs';

describe('FilesKenBurnsEffectService', () => {
  let service: FilesKenBurnsEffectService;
  let ffmpegService: {
    addComplexAudioMix: Mock;
    createKenBurnsVideoWithTransitions: Mock;
    generateKenBurnsSlide: Mock;
  };
  let filesService: {
    addWatermark: Mock;
    getPath: Mock;
    getSortedFiles: Mock;
  };
  let filesCaptionsService: {
    filterCaptions: Mock;
    getDrawtextFilters: Mock;
    getOverlayDrawtextFilters: Mock;
  };
  let loggerService: { error: Mock; log: Mock };

  const dimensions = { height: 1920, width: 1080 };
  const slideText = [
    { duration: 3, overlayText: 'A', voiceText: 'hello' },
    { duration: 2, overlayText: 'B', voiceText: 'world' },
  ];

  beforeEach(async () => {
    (fs.existsSync as Mock).mockReturnValue(false);
    (fs.readdirSync as Mock).mockReturnValue([]);
    (fs.readFileSync as Mock).mockReturnValue('');

    ffmpegService = {
      addComplexAudioMix: vi.fn().mockResolvedValue(undefined),
      createKenBurnsVideoWithTransitions: vi.fn().mockResolvedValue(undefined),
      generateKenBurnsSlide: vi.fn().mockResolvedValue(undefined),
    };
    filesService = {
      addWatermark: vi
        .fn()
        .mockResolvedValue('/tmp/output/final_watermark.mp4'),
      getPath: vi.fn((type: string, id: string) => `/tmp/${type}-${id}`),
      getSortedFiles: vi.fn().mockReturnValue(['1.jpeg', '2.jpeg']),
    };
    filesCaptionsService = {
      filterCaptions: vi.fn().mockReturnValue([]),
      getDrawtextFilters: vi.fn().mockReturnValue([]),
      getOverlayDrawtextFilters: vi.fn().mockReturnValue([]),
    };
    loggerService = { error: vi.fn(), log: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FilesKenBurnsEffectService,
        { provide: LoggerService, useValue: loggerService },
        { provide: FFmpegService, useValue: ffmpegService },
        { provide: FilesService, useValue: filesService },
        { provide: FilesCaptionsService, useValue: filesCaptionsService },
      ],
    }).compile();

    service = module.get<FilesKenBurnsEffectService>(
      FilesKenBurnsEffectService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateKenBurnsVideo / applyKenBurnsEffect', () => {
    it('generates slides, merges transitions, and returns the final video path', async () => {
      const result = await service.applyKenBurnsEffect(
        'https://example.com/image.jpg',
        3,
        'ingredient-1',
        { dimensions, slideText },
      );

      expect(filesService.getSortedFiles).toHaveBeenCalledWith(
        '/tmp/images-ingredient-1',
        'jpeg',
      );
      expect(ffmpegService.generateKenBurnsSlide).toHaveBeenCalledTimes(2);
      expect(
        ffmpegService.createKenBurnsVideoWithTransitions,
      ).toHaveBeenCalled();
      expect(ffmpegService.addComplexAudioMix).toHaveBeenCalled();
      expect(result).toContain('final.mp4');
    });

    it('throws when no image files are found', async () => {
      filesService.getSortedFiles.mockReturnValue([]);

      await expect(
        service.applyKenBurnsEffect(
          'https://example.com/image.jpg',
          3,
          'ingredient-1',
        ),
      ).rejects.toThrow('No image files found in the specified directory');
    });

    it('uses default slide text, dimensions, and font when no options are provided', async () => {
      filesService.getSortedFiles.mockReturnValue(['1.jpeg']);

      await service.applyKenBurnsEffect(
        'https://example.com/image.jpg',
        4,
        'ingredient-1',
      );

      expect(ffmpegService.generateKenBurnsSlide).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({ dimensions: { height: 1920, width: 1080 } }),
      );
    });

    it('writes clips to the clips directory when isClipSelected is true', async () => {
      await service.applyKenBurnsEffect(
        'https://example.com/image.jpg',
        3,
        'ingredient-1',
        { dimensions, isClipSelected: true, slideText },
      );

      expect(filesService.getPath).toHaveBeenCalledWith(
        'clips',
        'ingredient-1',
      );
    });

    it('applies a watermark when isWatermarkEnabled is true', async () => {
      const result = await service.applyKenBurnsEffect(
        'https://example.com/image.jpg',
        3,
        'ingredient-1',
        { dimensions, isWatermarkEnabled: true, slideText },
      );

      expect(filesService.addWatermark).toHaveBeenCalledWith(
        expect.stringContaining('final.mp4'),
        dimensions,
      );
      expect(result).toBe('/tmp/output/final_watermark.mp4');
    });

    it('propagates errors from slide generation', async () => {
      ffmpegService.generateKenBurnsSlide.mockRejectedValueOnce(
        new Error('slide failed'),
      );

      await expect(
        service.applyKenBurnsEffect(
          'https://example.com/image.jpg',
          3,
          'ingredient-1',
          { dimensions, slideText },
        ),
      ).rejects.toThrow('slide failed');
      expect(loggerService.error).toHaveBeenCalled();
    });

    it('propagates errors from the transition merge step', async () => {
      ffmpegService.createKenBurnsVideoWithTransitions.mockRejectedValueOnce(
        new Error('merge failed'),
      );

      await expect(
        service.applyKenBurnsEffect(
          'https://example.com/image.jpg',
          3,
          'ingredient-1',
          { dimensions, slideText },
        ),
      ).rejects.toThrow('merge failed');
    });

    it('propagates errors from the audio mix step', async () => {
      ffmpegService.addComplexAudioMix.mockRejectedValueOnce(
        new Error('audio failed'),
      );

      await expect(
        service.applyKenBurnsEffect(
          'https://example.com/image.jpg',
          3,
          'ingredient-1',
          { dimensions, slideText },
        ),
      ).rejects.toThrow('audio failed');
    });
  });

  describe('addAudios (via applyKenBurnsEffect)', () => {
    it('reads matching srt files and builds caption words with offsets', async () => {
      (fs.readdirSync as Mock).mockReturnValue(['0.mp3', '1.mp3']);
      (fs.existsSync as Mock).mockReturnValue(true);
      (fs.readFileSync as Mock).mockReturnValue(
        '1\n00:00:00,000 --> 00:00:01,000\nHi',
      );
      filesCaptionsService.filterCaptions.mockReturnValue([
        { end: 1000, start: 0, text: 'HI' },
      ]);

      await service.applyKenBurnsEffect(
        'https://example.com/image.jpg',
        3,
        'ingredient-1',
        { dimensions, slideText },
      );

      expect(filesCaptionsService.filterCaptions).toHaveBeenCalled();
      expect(ffmpegService.addComplexAudioMix).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({
          voicePaths: [
            expect.stringContaining('0.mp3'),
            expect.stringContaining('1.mp3'),
          ],
        }),
      );
    });

    it('skips missing srt files without reading them', async () => {
      (fs.readdirSync as Mock).mockReturnValue(['0.mp3']);
      (fs.existsSync as Mock).mockReturnValue(false);

      await service.applyKenBurnsEffect(
        'https://example.com/image.jpg',
        3,
        'ingredient-1',
        { dimensions, slideText },
      );

      expect(fs.readFileSync).not.toHaveBeenCalled();
    });

    it('ignores non-mp3 files in the voice directory', async () => {
      (fs.readdirSync as Mock).mockReturnValue(['0.mp3', 'notes.txt']);

      await service.applyKenBurnsEffect(
        'https://example.com/image.jpg',
        3,
        'ingredient-1',
        { dimensions, slideText },
      );

      const call = ffmpegService.addComplexAudioMix.mock.calls[0][2] as {
        voicePaths: string[];
      };
      expect(call.voicePaths).toHaveLength(1);
    });
  });
});
