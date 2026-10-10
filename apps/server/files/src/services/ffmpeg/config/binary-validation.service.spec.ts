import { execFileSync } from 'node:child_process';
import { BinaryValidationService } from '@files/services/ffmpeg/config/binary-validation.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';

vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  execFileSync: vi.fn(),
}));

// Mock ffmpeg-static and ffprobe-static
vi.mock('ffmpeg-static', () => ({ default: '/usr/local/bin/ffmpeg' }));
vi.mock('ffprobe-static', () => ({
  default: { path: '/usr/local/bin/ffprobe' },
}));

describe('BinaryValidationService', () => {
  let service: BinaryValidationService;
  let loggerService: LoggerService;

  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(async () => {
    vi.mocked(execFileSync).mockReset().mockReturnValue(Buffer.from('version'));
    // Reset static properties before each test
    BinaryValidationService.validated = false;
    BinaryValidationService.validationPromise = null;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BinaryValidationService,
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
      ],
    }).compile();

    service = module.get<BinaryValidationService>(BinaryValidationService);
    loggerService = module.get<LoggerService>(LoggerService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns validated binary paths', async () => {
    await service.validateBinaries();
    expect(service.getBinaryPaths()).toEqual({
      ffmpegPath: '/usr/local/bin/ffmpeg',
      ffprobePath: '/usr/local/bin/ffprobe',
    });
  });

  it('uses the installed native probe when the bundled probe cannot execute', async () => {
    vi.mocked(execFileSync).mockImplementation((binary) => {
      if (binary === '/usr/local/bin/ffprobe')
        throw new Error('Bad CPU type in executable');
      return Buffer.from('version');
    });
    await service.validateBinaries();
    expect(service.getBinaryPaths().ffprobePath).toBe('ffprobe');
    expect(execFileSync).toHaveBeenCalledWith('ffprobe', ['-version'], {
      stdio: 'ignore',
      timeout: 5_000,
    });
  });

  it('fails startup when neither probe executes and allows a repaired retry', async () => {
    vi.mocked(execFileSync).mockImplementation((binary) => {
      if (String(binary).includes('ffprobe')) throw new Error('not executable');
      return Buffer.from('version');
    });
    await expect(service.validateBinaries()).rejects.toThrow('no executable');
    expect(() => service.getBinaryPaths()).toThrow('Binaries not validated');
    vi.mocked(execFileSync).mockReturnValue(Buffer.from('version'));
    await service.validateBinaries();
    expect(service.getBinaryPaths().ffprobePath).toBe('/usr/local/bin/ffprobe');
  });

  it('rejects access before validation', () => {
    expect(() => service.getBinaryPaths()).toThrow(
      'Binaries not validated yet',
    );
  });

  describe('validateBinaries', () => {
    it('should validate binaries successfully', async () => {
      await service.validateBinaries();

      expect(loggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('Binary validation successful'),
        expect.any(Object),
      );
    });

    it('should only validate once', async () => {
      await service.validateBinaries();
      await service.validateBinaries();
      await service.validateBinaries();

      // Should only log once due to singleton pattern
      expect(loggerService.log).toHaveBeenCalledTimes(1);
    });

    it('should handle concurrent validation calls', async () => {
      const validations = [
        service.validateBinaries(),
        service.validateBinaries(),
        service.validateBinaries(),
      ];

      await Promise.all(validations);

      // Should only validate once
      expect(loggerService.log).toHaveBeenCalledTimes(1);
    });
  });
});
