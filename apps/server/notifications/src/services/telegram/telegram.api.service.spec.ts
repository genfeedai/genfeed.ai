import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { TelegramAPIService } from '@notifications/services/telegram/telegram.api.service';

describe('TelegramAPIService', () => {
  let service: TelegramAPIService;
  let loggerService: LoggerService;

  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramAPIService,
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
      ],
    }).compile();

    service = module.get<TelegramAPIService>(TelegramAPIService);
    loggerService = module.get<LoggerService>(LoggerService);

    loggerService.log('TelegramAPIService initialized');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sanitizeUserInput', () => {
    it('should escape HTML entities', () => {
      const input = '<script>alert("xss")</script>';
      const result = service.sanitizeUserInput(input);

      expect(result).toBe(
        '&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;',
      );
      expect(result).not.toContain('<');
      expect(result).not.toContain('>');
    });

    it('should handle empty input', () => {
      expect(service.sanitizeUserInput('')).toBe('');
      expect(service.sanitizeUserInput(null)).toBe('');
      expect(service.sanitizeUserInput(undefined)).toBe('');
    });

    it('should escape special characters', () => {
      const input = '& < > " \' /';
      const result = service.sanitizeUserInput(input);

      expect(result).toBe('&amp; &lt; &gt; &quot; &#x27; &#x2F;');
    });

    it('should not modify safe text', () => {
      const input = 'Hello World 123';
      const result = service.sanitizeUserInput(input);

      expect(result).toBe(input);
    });
  });
});
