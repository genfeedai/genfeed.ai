import { BinaryValidationService } from '@files/services/ffmpeg/config/binary-validation.service';
import { FFmpegCoreService } from '@files/services/ffmpeg/services/ffmpeg-core.service';
import { LoggerService } from '@libs/logger/logger.service';
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
  });

  describe('cleanupTempFiles', () => {
    it('calls unlink for each existing file', async () => {
      (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
      await service.cleanupTempFiles('/tmp/a.mp4', '/tmp/b.mp4');
      expect(fsp.unlink).toHaveBeenCalledTimes(2);
    });

    it('skips unlink when file does not exist', async () => {
      (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(false);
      await service.cleanupTempFiles('/tmp/missing.mp4');
      expect(fsp.unlink).not.toHaveBeenCalled();
    });

    it('logs a warning on unlink failure', async () => {
      (existsSync as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (fsp.unlink as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('EPERM'),
      );
      await service.cleanupTempFiles('/tmp/locked.mp4');
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
});
