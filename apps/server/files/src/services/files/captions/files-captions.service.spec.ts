import { ConfigService } from '@files/config/config.service';
import { FilesCaptionsService } from '@files/services/files/captions/files-captions.service';
import type {
  SlideText,
  Word,
} from '@files/shared/interfaces/caption.interface';
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

const childProcessMock = vi.hoisted(() => ({
  execFile: vi.fn(),
  spawn: vi.fn(),
}));
vi.mock('node:child_process', () => childProcessMock);

import { execFile, spawn } from 'node:child_process';
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

function mockFailingFfmpegProcess(code = 1) {
  (spawn as Mock).mockReturnValue({
    on: vi.fn((event: string, callback: (code: number) => void) => {
      if (event === 'close') {
        callback(code);
      }
    }),
  });
}

describe('FilesCaptionsService', () => {
  let service: FilesCaptionsService;

  beforeEach(async () => {
    (fs.existsSync as Mock).mockReturnValue(true);
    (execFile as unknown as Mock).mockImplementation(
      (
        _cmd: string,
        _args: string[],
        callback: (error: Error | null, result: unknown) => void,
      ) => {
        callback(null, {
          stderr: '',
          stdout: JSON.stringify({
            streams: [{ height: 1920, width: 1080 }],
          }),
        });
      },
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FilesCaptionsService,
        { provide: ConfigService, useValue: { get: vi.fn() } },
        {
          provide: LoggerService,
          useValue: { error: vi.fn(), log: vi.fn() },
        },
        {
          provide: HttpService,
          useValue: { get: vi.fn(), post: vi.fn() },
        },
      ],
    }).compile();

    service = module.get<FilesCaptionsService>(FilesCaptionsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('parses srt content', () => {
    const srt = `1\n00:00:00,000 --> 00:00:01,500\nHello world`;
    const words = service.filterCaptions(srt);
    expect(words).toEqual([
      { end: 750, start: 0, text: 'HELLO' },
      { end: 1500, start: 750, text: 'WORLD' },
    ]);
  });

  it('splits captions into words with timing', () => {
    const srt = `1\n00:00:00,000 --> 00:00:02,000\nHello world`;
    const words = service.filterCaptionsByWord(srt);
    expect(words).toEqual([
      { end: 1000, start: 0, text: 'HELLO' },
      { end: 2000, start: 1000, text: 'WORLD' },
    ]);
  });

  describe('getDrawtextFilters', () => {
    const words: Word[] = [
      { end: 500, start: 0, text: 'HELLO' },
      { end: 1000, start: 500, text: 'WORLD' },
    ];

    it('chains drawtext filters from [0:v] to [vFinal]', () => {
      const filters = service.getDrawtextFilters('montserrat-black', words, {
        height: 1920,
        width: 1080,
      });

      expect(filters).toHaveLength(2);
      expect(filters[0]).toContain('[0:v]drawtext=');
      expect(filters[0]).toContain('[v1]');
      expect(filters[1]).toContain('[v1]drawtext=');
      expect(filters[1]).toContain('[vFinal]');
      expect(filters[0]).toContain("text='HELLO'");
    });

    it('falls back to a 1920 height and default font when none is provided', () => {
      const filters = service.getDrawtextFilters('', words);

      expect(filters[0]).toContain('montserrat-black.ttf');
    });
  });

  describe('getOverlayDrawtextFilters', () => {
    it('builds overlay filters only for slides with overlay text', () => {
      const slides: SlideText[] = [
        { duration: 2, overlayText: 'Intro', voiceText: 'hi' },
        { duration: 3, voiceText: 'no overlay here' },
        { duration: 1, overlayText: 'Outro', voiceText: 'bye' },
      ];

      const filters = service.getOverlayDrawtextFilters(
        'montserrat-black',
        slides,
        { height: 1920, width: 1080 },
      );

      expect(filters).toHaveLength(2);
      expect(filters[0]).toContain("text='Intro'");
      expect(filters[1]).toContain("text='Outro'");
      expect(filters[1]).toContain('[vFinal]');
    });

    it('returns an empty array when no slide has overlay text', () => {
      const slides: SlideText[] = [{ duration: 2, voiceText: 'no overlay' }];

      const filters = service.getOverlayDrawtextFilters(
        'montserrat-black',
        slides,
      );

      expect(filters).toEqual([]);
    });

    it('appends a copy filter when the final label is not already vFinal', () => {
      const slides: SlideText[] = [
        { duration: 2, overlayText: 'Only slide', voiceText: 'hi' },
        { duration: 2, voiceText: 'trailing slide without overlay' },
      ];

      const filters = service.getOverlayDrawtextFilters(
        'montserrat-black',
        slides,
      );

      expect(filters[filters.length - 1]).toContain('copy[vFinal]');
    });
  });

  describe('addCaptionsToVideo', () => {
    it('probes the video, builds filters, and runs ffmpeg', async () => {
      mockSuccessfulFfmpegProcess();

      const srt = `1\n00:00:00,000 --> 00:00:01,000\nHello`;
      const result = await service.addCaptionsToVideo(
        'videos',
        'ingredient-1',
        'source.mp4',
        srt,
      );

      expect(execFile).toHaveBeenCalled();
      expect(spawn).toHaveBeenCalled();
      expect(result).toContain('captions.mp4');
    });

    it('propagates ffmpeg failures', async () => {
      mockFailingFfmpegProcess(1);

      const srt = `1\n00:00:00,000 --> 00:00:01,000\nHello`;

      await expect(
        service.addCaptionsToVideo('videos', 'ingredient-1', 'source.mp4', srt),
      ).rejects.toThrow('ffmpeg exited with code 1');
    });
  });

  describe('generateCaptions', () => {
    it('delegates to addCaptionsToVideo with the standard video input', async () => {
      mockSuccessfulFfmpegProcess();

      const srt = `1\n00:00:00,000 --> 00:00:01,000\nHello`;
      const result = await service.generateCaptions(
        'https://example.com/video.mp4',
        srt,
        'ingredient-1',
      );

      expect(result).toContain('captions.mp4');
    });
  });
});
