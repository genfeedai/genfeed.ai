import { BinaryValidationService } from '@files/services/ffmpeg/config/binary-validation.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';

// Mock ffmpeg-static and ffprobe-static
vi.mock('ffmpeg-static', () => '/usr/local/bin/ffmpeg');
vi.mock('ffprobe-static', () => ({
  path: '/usr/local/bin/ffprobe',
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

  it('should be defined', () => {
    expect(service).toBeDefined();
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
