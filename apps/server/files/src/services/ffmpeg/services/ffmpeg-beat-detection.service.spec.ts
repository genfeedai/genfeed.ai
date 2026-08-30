import { FFmpegBeatDetectionService } from '@files/services/ffmpeg/services/ffmpeg-beat-detection.service';
import { FFmpegCoreService } from '@files/services/ffmpeg/services/ffmpeg-core.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';

// `@genfeedai/enums` is used as-is: mocking it would shadow other exports and
// break transitive imports (see ffmpeg-beat-sync.service.spec.ts).

vi.mock('@files/helpers/utils/security/security.util', () => ({
  SecurityUtil: {
    validateFileExists: vi.fn().mockResolvedValue(undefined),
    validateFileExtension: vi.fn(),
    validateFilePath: vi.fn((p: string) => p),
  },
}));

interface SpawnScript {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  errorMessage?: string;
}

type Handler = (...args: unknown[]) => void;

function createMockProcess(script: SpawnScript) {
  const handlers: Record<string, Handler[]> = {};
  const on = (event: string, cb: Handler) => {
    if (!handlers[event]) {
      handlers[event] = [];
    }
    handlers[event].push(cb);
  };

  const proc = {
    on: vi.fn(on),
    stderr: {
      on: vi.fn((event: string, cb: Handler) => on(`stderr:${event}`, cb)),
    },
    stdout: {
      on: vi.fn((event: string, cb: Handler) => on(`stdout:${event}`, cb)),
    },
  };

  queueMicrotask(() => {
    if (script.errorMessage) {
      handlers.error?.forEach((cb) => {
        cb(new Error(script.errorMessage));
      });
      return;
    }
    if (script.stdout) {
      handlers['stdout:data']?.forEach((cb) => {
        cb(Buffer.from(script.stdout as string));
      });
    }
    if (script.stderr) {
      handlers['stderr:data']?.forEach((cb) => {
        cb(Buffer.from(script.stderr as string));
      });
    }
    handlers.close?.forEach((cb) => {
      cb(script.exitCode ?? 0);
    });
  });

  return proc;
}

const spawnMock = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', () => ({ spawn: spawnMock }));

describe('FFmpegBeatDetectionService', () => {
  let service: FFmpegBeatDetectionService;
  let core: {
    cleanupTempFiles: ReturnType<typeof vi.fn>;
    ensureOutputDir: ReturnType<typeof vi.fn>;
    executeFFmpeg: ReturnType<typeof vi.fn>;
    getTempPath: ReturnType<typeof vi.fn>;
    probe: ReturnType<typeof vi.fn>;
  };
  let logger: {
    debug: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    log: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    core = {
      cleanupTempFiles: vi.fn().mockResolvedValue(undefined),
      ensureOutputDir: vi.fn().mockResolvedValue(undefined),
      executeFFmpeg: vi.fn().mockResolvedValue(undefined),
      getTempPath: vi.fn().mockReturnValue('/tmp/beat-analysis'),
      probe: vi.fn().mockResolvedValue({ format: { duration: '10' } }),
    };
    logger = { debug: vi.fn(), error: vi.fn(), log: vi.fn(), warn: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FFmpegBeatDetectionService,
        { provide: FFmpegCoreService, useValue: core },
        { provide: LoggerService, useValue: logger },
      ],
    }).compile();

    service = module.get<FFmpegBeatDetectionService>(
      FFmpegBeatDetectionService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('analyzes beats using aubio when it succeeds', async () => {
    spawnMock.mockImplementation((command: string, args: string[]) => {
      if (command === 'aubio' && args[0] === 'tempo') {
        return createMockProcess({ stdout: '128.0\n' });
      }
      if (command === 'aubio' && args[0] === 'onset') {
        return createMockProcess({
          stdout: '0.0\n0.47\n0.94\n1.41\n1.88\n',
        });
      }
      throw new Error(`unexpected spawn: ${command} ${args.join(' ')}`);
    });

    const result = await service.analyzeBeat('/tmp/audio.mp3');

    expect(result.analysisMethod).toBe('aubio');
    expect(result.tempo).toBe(128);
    expect(result.beatCount).toBe(result.beatTimestamps.length);
    expect(result.beatCount).toBeGreaterThan(0);
    expect(core.cleanupTempFiles).toHaveBeenCalledWith(
      expect.stringContaining('_audio.wav'),
    );
    expect(core.executeFFmpeg).toHaveBeenCalled();
  });

  it('clamps the detected tempo to the requested min/max BPM range', async () => {
    spawnMock.mockImplementation((command: string, args: string[]) => {
      if (command === 'aubio' && args[0] === 'tempo') {
        return createMockProcess({ stdout: '999.0\n' });
      }
      if (command === 'aubio' && args[0] === 'onset') {
        return createMockProcess({ stdout: '0.0\n0.5\n1.0\n' });
      }
      throw new Error('unexpected spawn');
    });

    const result = await service.analyzeBeat('/tmp/audio.mp3', {
      maxBpm: 180,
      minBpm: 80,
    });

    expect(result.tempo).toBe(180);
  });

  it('falls back to FFmpeg volume analysis when aubio is unavailable', async () => {
    spawnMock.mockImplementation((command: string) => {
      if (command === 'aubio') {
        return createMockProcess({ errorMessage: 'command not found' });
      }
      if (command === 'ffmpeg') {
        // No RMS lines are emitted, so the service falls back to its
        // deterministic synthetic volume profile.
        return createMockProcess({ exitCode: 0, stderr: '' });
      }
      throw new Error(`unexpected spawn: ${command}`);
    });

    const result = await service.analyzeBeat('/tmp/audio.mp3');

    expect(result.analysisMethod).toBe('ffmpeg');
    expect(result.confidence).toBe(0.6);
    expect(result.beatTimestamps).toEqual([
      0, 0.6999999999999993, 1.3999999999999986, 2.099999999999998,
      2.799999999999997, 3.4999999999999964, 4.199999999999996,
      4.899999999999995, 5.599999999999994, 6.299999999999994,
      6.999999999999993, 7.699999999999992, 8.399999999999991, 9.09999999999999,
      9.79999999999999,
    ]);
    expect(core.probe).toHaveBeenCalledWith('/tmp/audio.mp3');
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('aubio failed, falling back to FFmpeg'),
      expect.any(Object),
    );
  });

  it('returns a default 120 BPM pattern when duration is zero', async () => {
    core.probe.mockResolvedValue({ format: { duration: '0' } });
    spawnMock.mockImplementation((command: string) => {
      if (command === 'aubio') {
        return createMockProcess({ errorMessage: 'not available' });
      }
      return createMockProcess({ exitCode: 0 });
    });

    const result = await service.analyzeBeat('/tmp/audio.mp3');

    expect(result.analysisMethod).toBe('ffmpeg');
    expect(result.tempo).toBe(120);
    expect(result.beatTimestamps).toEqual([]);
  });

  it('preserves the regular 120 BPM fallback when too few peaks exist', async () => {
    core.probe.mockResolvedValue({ format: { duration: '1.1' } });
    spawnMock.mockImplementation((command: string) => {
      if (command === 'aubio') {
        return createMockProcess({ errorMessage: 'not available' });
      }
      return createMockProcess({
        exitCode: 0,
        stdout: 'lavfi.astats.Overall.RMS_level=-12.0\n',
      });
    });

    const result = await service.analyzeBeat('/tmp/audio.mp3');

    expect(result.tempo).toBe(120);
    expect(result.beatTimestamps).toEqual([0, 0.5, 1]);
  });

  it('falls back to FFmpeg when the aubio tempo output is not a valid number', async () => {
    spawnMock.mockImplementation((command: string, args: string[]) => {
      if (command === 'aubio' && args[0] === 'tempo') {
        return createMockProcess({ stdout: 'not-a-number\n' });
      }
      if (command === 'aubio' && args[0] === 'onset') {
        return createMockProcess({ stdout: '0.0\n0.5\n' });
      }
      return createMockProcess({ exitCode: 0 });
    });

    const result = await service.analyzeBeat('/tmp/audio.mp3');

    expect(result.analysisMethod).toBe('ffmpeg');
  });

  it('propagates path validation errors before spawning any process', async () => {
    const { SecurityUtil } = await import(
      '@files/helpers/utils/security/security.util'
    );
    (
      SecurityUtil.validateFileExists as ReturnType<typeof vi.fn>
    ).mockRejectedValueOnce(new Error('file missing'));

    await expect(service.analyzeBeat('/tmp/missing.mp3')).rejects.toThrow(
      'file missing',
    );
    expect(spawnMock).not.toHaveBeenCalled();
  });
});
