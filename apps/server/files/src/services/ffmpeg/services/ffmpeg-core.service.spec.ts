import { ConfigService } from '@files/config/config.service';
import { FILES_TMP_ROOT } from '@files/constants/path.constants';
import { BinaryValidationService } from '@files/services/ffmpeg/config/binary-validation.service';
import { FFmpegCoreService } from '@files/services/ffmpeg/services/ffmpeg-core.service';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn(),
  promises: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    unlink: vi.fn().mockResolvedValue(undefined),
  },
}));

import { spawn } from 'node:child_process';
import { existsSync, promises as fsp } from 'node:fs';
import path from 'node:path';

describe('FFmpegCoreService', () => {
  let service: FFmpegCoreService;
  let binaryValidationService: {
    getBinaryPaths: ReturnType<typeof vi.fn>;
    validateBinaries: ReturnType<typeof vi.fn>;
  };
  let logger: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  const makeMockProcess = (
    exitCode: number,
    stdoutData = '',
    stderrData = '',
  ) => {
    const proc = {
      on: vi.fn(),
      stderr: { on: vi.fn() },
      stdout: { on: vi.fn() },
    };

    proc.stderr.on.mockImplementation(
      (event: string, cb: (d: Buffer) => void) => {
        if (event === 'data') cb(Buffer.from(stderrData));
      },
    );

    proc.stdout.on.mockImplementation(
      (event: string, cb: (d: Buffer) => void) => {
        if (event === 'data') cb(Buffer.from(stdoutData));
      },
    );

    proc.on.mockImplementation((event: string, cb: (code?: number) => void) => {
      if (event === 'close') setTimeout(() => cb(exitCode), 0);
    });

    return proc;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FFmpegCoreService,
        {
          provide: BinaryValidationService,
          useValue: {
            getBinaryPaths: vi.fn().mockReturnValue({
              ffmpegPath: '/usr/bin/ffmpeg',
              ffprobePath: '/usr/bin/ffprobe',
            }),
            validateBinaries: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: { get: vi.fn().mockReturnValue(undefined) },
        },
      ],
    }).compile();

    service = module.get(FFmpegCoreService);
    binaryValidationService = module.get(BinaryValidationService);
    logger = module.get(LoggerService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('validates binaries during initialization', async () => {
      await service.onModuleInit();
      expect(binaryValidationService.validateBinaries).toHaveBeenCalledTimes(1);
    });
  });

  describe('executeFFmpeg', () => {
    it('resolves when ffmpeg exits with code 0', async () => {
      (spawn as ReturnType<typeof vi.fn>).mockReturnValue(makeMockProcess(0));
      await expect(
        service.executeFFmpeg(['-version']),
      ).resolves.toBeUndefined();
    });

    it('rejects when ffmpeg exits with non-zero code', async () => {
      (spawn as ReturnType<typeof vi.fn>).mockReturnValue(
        makeMockProcess(1, '', 'Invalid argument'),
      );
      await expect(service.executeFFmpeg(['-i', 'bad.mp4'])).rejects.toThrow(
        'FFmpeg exited with code 1',
      );
    });

    it('calls spawn with the correct ffmpeg binary path', async () => {
      (spawn as ReturnType<typeof vi.fn>).mockReturnValue(makeMockProcess(0));
      await service.executeFFmpeg(['-version']);
      expect(spawn).toHaveBeenCalledWith('/usr/bin/ffmpeg', ['-version']);
    });
  });

  describe('getTempPath', () => {
    it('returns a path containing the type', () => {
      const result = service.getTempPath('video');
      expect(result).toContain('video');
    });

    it('includes ingredientId in path when provided', () => {
      const result = service.getTempPath('audio', 'ingredient-123');
      expect(result).toContain('ingredient-123');
    });

    it('returns a string path', () => {
      const result = service.getTempPath('image');
      expect(typeof result).toBe('string');
    });

    it.each(['../video', 'nested/video', '/absolute'])(
      'rejects traversal-shaped type %s',
      (type) => {
        expect(() => service.getTempPath(type)).toThrow(BadRequestException);
      },
    );

    it('accepts a legitimate nested temp directory under the fixed root', () => {
      expect(service.getTempPath('audio', 'ingredient-123')).toBe(
        path.join(FILES_TMP_ROOT, 'audio', 'ingredient-123'),
      );
    });
  });

  describe('cleanupTempFiles', () => {
    it('calls unlink for each existing file', async () => {
      (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
      await service.cleanupTempFiles(
        path.join(FILES_TMP_ROOT, 'a.mp4'),
        path.join(FILES_TMP_ROOT, 'nested', 'b.mp4'),
      );
      expect(fsp.unlink).toHaveBeenCalledTimes(2);
    });

    it('skips unlink when file does not exist', async () => {
      (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);
      await service.cleanupTempFiles(path.join(FILES_TMP_ROOT, 'missing.mp4'));
      expect(fsp.unlink).not.toHaveBeenCalled();
    });

    it('logs a warning on unlink failure', async () => {
      (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (fsp.unlink as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('EPERM'),
      );
      await service.cleanupTempFiles(path.join(FILES_TMP_ROOT, 'locked.mp4'));
      expect(logger.error).toHaveBeenCalled();
    });

    it('skips a traversal attempt and continues with an in-root sibling', async () => {
      (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);

      await service.cleanupTempFiles(
        path.join(FILES_TMP_ROOT, '..', 'escaped.mp4'),
        path.join(FILES_TMP_ROOT, 'safe.mp4'),
      );

      expect(fsp.unlink).toHaveBeenCalledOnce();
      expect(fsp.unlink).toHaveBeenCalledWith(
        path.join(FILES_TMP_ROOT, 'safe.mp4'),
      );
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('ensureOutputDir', () => {
    it('creates directory for the output path', async () => {
      await service.ensureOutputDir('/tmp/output/video.mp4');
      expect(fsp.mkdir).toHaveBeenCalledWith(
        path.dirname('/tmp/output/video.mp4'),
        { recursive: true },
      );
    });
  });

  describe('executeFFmpeg concurrency cap (FFMPEG_MAX_CONCURRENCY)', () => {
    type ProcessControl = {
      close: (code: number) => void;
      error: (err: Error) => void;
    };

    const buildService = async (
      maxConcurrency?: string,
    ): Promise<FFmpegCoreService> => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          FFmpegCoreService,
          {
            provide: BinaryValidationService,
            useValue: {
              getBinaryPaths: vi.fn().mockReturnValue({
                ffmpegPath: '/usr/bin/ffmpeg',
                ffprobePath: '/usr/bin/ffprobe',
              }),
              validateBinaries: vi.fn().mockResolvedValue(undefined),
            },
          },
          {
            provide: LoggerService,
            useValue: {
              debug: vi.fn(),
              error: vi.fn(),
              log: vi.fn(),
              warn: vi.fn(),
            },
          },
          {
            provide: ConfigService,
            useValue: {
              get: vi.fn((key: string) =>
                key === 'FFMPEG_MAX_CONCURRENCY' ? maxConcurrency : undefined,
              ),
            },
          },
        ],
      }).compile();

      return module.get(FFmpegCoreService);
    };

    // Builds a spawn() stand-in whose 'close'/'error' handlers are only
    // fired when the test explicitly invokes the returned control, so
    // in-flight process count can be observed deterministically.
    const makeControllableProcess = (): {
      proc: {
        on: ReturnType<typeof vi.fn>;
        stderr: { on: ReturnType<typeof vi.fn> };
        stdout: { on: ReturnType<typeof vi.fn> };
      };
      control: ProcessControl;
    } => {
      let closeHandler: ((code: number) => void) | undefined;
      let errorHandler: ((err: Error) => void) | undefined;

      const proc = {
        on: vi.fn((event: string, cb: (arg?: number | Error) => void) => {
          if (event === 'close') closeHandler = cb as (code: number) => void;
          if (event === 'error') errorHandler = cb as (err: Error) => void;
        }),
        stderr: { on: vi.fn() },
        stdout: { on: vi.fn() },
      };

      return {
        control: {
          close: (code: number) => closeHandler?.(code),
          error: (err: Error) => errorHandler?.(err),
        },
        proc,
      };
    };

    const flushMicrotasks = async (): Promise<void> => {
      for (let i = 0; i < 5; i += 1) {
        await Promise.resolve();
      }
    };

    it('never spawns more than K ffmpeg processes at once and drains the queue FIFO', async () => {
      const K = 2;
      const service = await buildService(String(K));
      const activated: ProcessControl[] = [];
      let spawnCount = 0;

      (spawn as ReturnType<typeof vi.fn>).mockImplementation(() => {
        spawnCount += 1;
        const { proc, control } = makeControllableProcess();
        activated.push(control);
        return proc;
      });

      const results = Array.from({ length: 6 }, (_, i) =>
        service.executeFFmpeg([`-task-${i}`]).catch((error: Error) => error),
      );

      await flushMicrotasks();
      expect(spawnCount).toBe(K);

      // Completing the first (FIFO) in-flight process must release exactly
      // one slot to the third queued task, never more than K at once.
      activated[0].close(0);
      await flushMicrotasks();
      expect(spawnCount).toBe(K + 1);

      // A failing process must still release its slot (finally-path).
      activated[1].close(1);
      await flushMicrotasks();
      expect(spawnCount).toBe(K + 2);

      activated[2].close(0);
      await flushMicrotasks();
      expect(spawnCount).toBe(K + 3);

      activated[3].close(0);
      await flushMicrotasks();
      expect(spawnCount).toBe(6);

      activated[4].close(0);
      activated[5].close(0);

      const settled = await Promise.all(results);
      expect(spawnCount).toBe(6);
      // Task 1 (second FIFO slot) was closed with a non-zero exit code.
      expect(settled[1]).toBeInstanceOf(Error);
    });

    it('releases the slot on process error, not only on close', async () => {
      const service = await buildService('1');
      const activated: ProcessControl[] = [];
      let spawnCount = 0;

      (spawn as ReturnType<typeof vi.fn>).mockImplementation(() => {
        spawnCount += 1;
        const { proc, control } = makeControllableProcess();
        activated.push(control);
        return proc;
      });

      const first = service
        .executeFFmpeg(['-task-0'])
        .catch((error: Error) => error);
      const second = service
        .executeFFmpeg(['-task-1'])
        .catch((error: Error) => error);

      await flushMicrotasks();
      expect(spawnCount).toBe(1);

      activated[0].error(new Error('spawn ENOENT'));
      await flushMicrotasks();
      expect(spawnCount).toBe(2);

      activated[1].close(0);
      const [firstResult] = await Promise.all([first, second]);
      expect(firstResult).toBeInstanceOf(Error);
    });

    it('defaults to a concurrency of 4 when FFMPEG_MAX_CONCURRENCY is unset', async () => {
      const service = await buildService(undefined);
      let spawnCount = 0;

      (spawn as ReturnType<typeof vi.fn>).mockImplementation(() => {
        spawnCount += 1;
        const { proc } = makeControllableProcess();
        return proc;
      });

      for (let i = 0; i < 5; i += 1) {
        service.executeFFmpeg([`-task-${i}`]).catch(() => undefined);
      }

      await flushMicrotasks();
      expect(spawnCount).toBe(4);
    });
  });
});
