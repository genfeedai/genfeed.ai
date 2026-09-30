import { ConfigService } from '@files/config/config.service';
import { FFmpegService } from '@files/services/ffmpeg/services/ffmpeg.service';
import { FilesCaptionsService } from '@files/services/files/captions/files-captions.service';
import { FilesImageToVideoService } from '@files/services/files/image-to-video/files-image-to-video.service';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import type { Mock } from 'vitest';

const fsMock = vi.hoisted(() => ({
  copyFileSync: vi.fn(),
  existsSync: vi.fn().mockReturnValue(false),
  mkdirSync: vi.fn(),
  readdirSync: vi.fn().mockReturnValue([]),
  readFileSync: vi.fn().mockReturnValue(''),
  unlinkSync: vi.fn(),
}));
vi.mock('fs', () => ({ ...fsMock, default: fsMock }));
vi.mock('node:fs', () => ({ ...fsMock, default: fsMock }));

const childProcessMock = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock('node:child_process', () => childProcessMock);

import { spawn } from 'node:child_process';
import * as fs from 'node:fs';

function mockSuccessfulFfmpegProcess() {
  (spawn as Mock).mockReturnValue({
    on: vi.fn((event: string, callback: (code: number) => void) => {
      if (event === 'close') {
        callback(0);
      }
    }),
  });
}

describe('FilesImageToVideoService', () => {
  let service: FilesImageToVideoService;
  let ffmpegService: {
    addAudioAndTextToVideo: Mock;
    mergeVideosWithMusic: Mock;
    scaleVideo: Mock;
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
    (fs.readdirSync as Mock).mockReturnValue(['0.mp4', '1.mp4']);
    (fs.readFileSync as Mock).mockReturnValue('');

    ffmpegService = {
      addAudioAndTextToVideo: vi.fn().mockResolvedValue(undefined),
      mergeVideosWithMusic: vi.fn().mockResolvedValue(undefined),
      scaleVideo: vi.fn().mockResolvedValue(undefined),
    };
    filesCaptionsService = {
      filterCaptions: vi.fn().mockReturnValue([]),
      getDrawtextFilters: vi.fn().mockReturnValue([]),
      getOverlayDrawtextFilters: vi.fn().mockReturnValue([]),
    };
    loggerService = { error: vi.fn(), log: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FilesImageToVideoService,
        { provide: ConfigService, useValue: { get: vi.fn() } },
        { provide: LoggerService, useValue: loggerService },
        {
          provide: HttpService,
          useValue: { get: vi.fn(), post: vi.fn() },
        },
        { provide: FFmpegService, useValue: ffmpegService },
        { provide: FilesCaptionsService, useValue: filesCaptionsService },
      ],
    }).compile();

    service = module.get<FilesImageToVideoService>(FilesImageToVideoService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateImageToVideo / createVideoFromImages', () => {
    it('throws when no clip files are found', async () => {
      (fs.readdirSync as Mock).mockReturnValue([]);

      await expect(
        service.createVideoFromImages(
          [],
          { dimensions, slideText },
          'ingredient-1',
        ),
      ).rejects.toThrow('No clip files found in the specified directory');
    });

    it('copies the single processed clip when no background music exists', async () => {
      (fs.readdirSync as Mock).mockReturnValue(['0.mp4']);
      (fs.existsSync as Mock).mockReturnValue(false);

      const result = await service.createVideoFromImages(
        [],
        { dimensions, slideText: [slideText[0]] },
        'ingredient-1',
      );

      expect(fs.copyFileSync).toHaveBeenCalled();
      expect(ffmpegService.mergeVideosWithMusic).not.toHaveBeenCalled();
      expect(result).toContain('merged.mp4');
    });

    it('merges via mergeVideosWithMusic when a single clip has background music', async () => {
      (fs.readdirSync as Mock).mockReturnValue(['0.mp4']);
      (fs.existsSync as Mock).mockImplementation(
        (filePath: string) =>
          filePath.includes('frame-0.mp3') && filePath.includes('musics'),
      );

      await service.createVideoFromImages(
        [],
        { dimensions, slideText: [slideText[0]] },
        'ingredient-1',
      );

      expect(ffmpegService.mergeVideosWithMusic).toHaveBeenCalled();
      expect(fs.copyFileSync).not.toHaveBeenCalled();
    });

    it('always merges when there are multiple clips', async () => {
      (fs.readdirSync as Mock).mockReturnValue(['0.mp4', '1.mp4']);

      const result = await service.createVideoFromImages(
        [],
        { dimensions, slideText },
        'ingredient-1',
      );

      expect(ffmpegService.mergeVideosWithMusic).toHaveBeenCalled();
      expect(result).toContain('merged.mp4');
    });

    it('applies a watermark when isWatermarkEnabled is true', async () => {
      mockSuccessfulFfmpegProcess();

      const result = await service.createVideoFromImages(
        [],
        { dimensions, isWatermarkEnabled: true, slideText },
        'ingredient-1',
      );

      expect(spawn).toHaveBeenCalled();
      expect(result).toContain('_watermark.mp4');
    });

    it('uses default slideText, dimensions, and fontFamily when omitted', async () => {
      (fs.readdirSync as Mock).mockReturnValue(['0.mp4']);

      await service.createVideoFromImages([], {}, 'ingredient-1');

      expect(ffmpegService.scaleVideo).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        { height: 1920, width: 1080 },
        expect.any(Object),
      );
    });

    it('cleans up the scaled temp file after processing each clip', async () => {
      (fs.readdirSync as Mock).mockReturnValue(['0.mp4']);
      (fs.existsSync as Mock).mockReturnValue(true);

      await service.createVideoFromImages(
        [],
        { dimensions, slideText: [slideText[0]] },
        'ingredient-1',
      );

      expect(fs.unlinkSync).toHaveBeenCalledWith(
        expect.stringContaining('scaled_0.mp4'),
      );
    });

    it('propagates errors from scaleVideo', async () => {
      ffmpegService.scaleVideo.mockRejectedValueOnce(new Error('scale failed'));

      await expect(
        service.createVideoFromImages(
          [],
          { dimensions, slideText },
          'ingredient-1',
        ),
      ).rejects.toThrow('scale failed');
    });

    it('propagates errors from mergeVideosWithMusic', async () => {
      ffmpegService.mergeVideosWithMusic.mockRejectedValueOnce(
        new Error('merge failed'),
      );

      await expect(
        service.createVideoFromImages(
          [],
          { dimensions, slideText },
          'ingredient-1',
        ),
      ).rejects.toThrow('merge failed');
      expect(loggerService.error).toHaveBeenCalled();
    });
  });

  describe('addAudioToClip (via createVideoFromImages)', () => {
    it('includes voice audio and caption filters when srt and voice files exist', async () => {
      (fs.readdirSync as Mock).mockReturnValue(['0.mp4']);
      (fs.existsSync as Mock).mockReturnValue(true);
      filesCaptionsService.filterCaptions.mockReturnValue([
        { end: 1000, start: 0, text: 'HI' },
      ]);

      await service.createVideoFromImages(
        [],
        { dimensions, slideText: [slideText[0]] },
        'ingredient-1',
      );

      expect(filesCaptionsService.filterCaptions).toHaveBeenCalled();
      expect(ffmpegService.addAudioAndTextToVideo).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({ includeAudio: true }),
      );
    });

    it('excludes audio when no voice file exists', async () => {
      (fs.readdirSync as Mock).mockReturnValue(['0.mp4']);
      (fs.existsSync as Mock).mockReturnValue(false);

      await service.createVideoFromImages(
        [],
        { dimensions, slideText: [slideText[0]] },
        'ingredient-1',
      );

      expect(ffmpegService.addAudioAndTextToVideo).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.objectContaining({ audioPath: undefined, includeAudio: false }),
      );
    });

    it('propagates errors from addAudioAndTextToVideo', async () => {
      (fs.readdirSync as Mock).mockReturnValue(['0.mp4']);
      ffmpegService.addAudioAndTextToVideo.mockRejectedValueOnce(
        new Error('audio failed'),
      );

      await expect(
        service.createVideoFromImages(
          [],
          { dimensions, slideText: [slideText[0]] },
          'ingredient-1',
        ),
      ).rejects.toThrow('audio failed');
    });
  });
});
