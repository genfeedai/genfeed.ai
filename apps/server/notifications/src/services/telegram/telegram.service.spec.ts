import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '@notifications/config/config.service';
import { TelegramService } from '@notifications/services/telegram/telegram.service';

describe('TelegramService', () => {
  let service: TelegramService;
  let loggerService: LoggerService;

  const mockConfigService = {
    get: vi.fn().mockReturnValue('123,456,789'),
    isTelegramEnabled: vi.fn().mockReturnValue(false),
  };

  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
      ],
    }).compile();

    service = module.get<TelegramService>(TelegramService);
    module.get<ConfigService>(ConfigService);
    loggerService = module.get<LoggerService>(LoggerService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('isAdmin', () => {
    it('should return true for admin users', () => {
      const result = service.isAdmin(123);
      expect(result).toBe(true);
    });

    it('should return false for non-admin users', () => {
      const result = service.isAdmin(999);
      expect(result).toBe(false);
    });
  });

  describe('initialization', () => {
    it('should log when Telegram is not enabled', () => {
      expect(loggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('skipping initialization'),
      );
    });
  });
});
