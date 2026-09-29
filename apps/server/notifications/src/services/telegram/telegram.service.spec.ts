import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { ConfigService } from '@notifications/config/config.service';
import { TelegramService } from '@notifications/services/telegram/telegram.service';

const mockSendMessage = vi.fn();
const mockSendPhoto = vi.fn();
const mockSendVideo = vi.fn();
let shouldThrowOnConstruct = false;

vi.mock('grammy', () => ({
  Bot: vi.fn(function MockBot() {
    if (shouldThrowOnConstruct) {
      throw new Error('Invalid token');
    }
    return {
      api: {
        sendMessage: mockSendMessage,
        sendPhoto: mockSendPhoto,
        sendVideo: mockSendVideo,
      },
    };
  }),
}));

vi.mock('@libs/utils/caller/caller.util', () => ({
  CallerUtil: {
    getCallerName: vi.fn().mockReturnValue('testCaller'),
  },
}));

interface TelegramTestConfig {
  isEnabled: boolean;
  values?: Record<string, string | undefined>;
}

describe('TelegramService', () => {
  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  async function createService(
    config: TelegramTestConfig,
  ): Promise<TelegramService> {
    const mockConfigService = {
      get: vi.fn((key: string) => {
        if (config.values && key in config.values) {
          return config.values[key];
        }
        return key === 'TELEGRAM_ADMIN_IDS' ? '123,456,789' : undefined;
      }),
      isTelegramEnabled: vi.fn().mockReturnValue(config.isEnabled),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    }).compile();

    return module.get<TelegramService>(TelegramService);
  }

  beforeEach(() => {
    vi.clearAllMocks();
    shouldThrowOnConstruct = false;
  });

  describe('initialization', () => {
    it('should warn when enabled but token is missing', async () => {
      await createService({
        isEnabled: true,
        values: { TELEGRAM_BOT_TOKEN: undefined },
      });

      expect(mockLoggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('TELEGRAM_BOT_TOKEN is missing'),
        expect.any(Object),
      );
    });

    it('should log error when bot construction fails', async () => {
      shouldThrowOnConstruct = true;

      await createService({
        isEnabled: true,
        values: { TELEGRAM_BOT_TOKEN: 'bad-token' },
      });

      expect(mockLoggerService.error).toHaveBeenCalledWith(
        'Failed to initialize Telegram bot',
        expect.any(Error),
        expect.any(Object),
      );
    });
  });

  describe('isAdmin', () => {
    it('should return false for non-admin users', async () => {
      const service = await createService({ isEnabled: false });
      expect(service.isAdmin(999)).toBe(false);
    });

    it('should return false when no admin ids are configured', async () => {
      const service = await createService({
        isEnabled: false,
        values: { TELEGRAM_ADMIN_IDS: undefined },
      });
      expect(service.isAdmin(123)).toBe(false);
    });
  });

  describe('sendMessage', () => {
    it('should warn and skip when bot is not initialized', async () => {
      const service = await createService({ isEnabled: false });

      await service.sendMessage('chat-1', 'hello');

      expect(mockLoggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('Bot not initialized'),
        expect.any(Object),
      );
      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it('should send a markdown message via the bot api', async () => {
      const service = await createService({
        isEnabled: true,
        values: { TELEGRAM_BOT_TOKEN: 'bot-token' },
      });

      await service.sendMessage('chat-1', 'hello');

      expect(mockSendMessage).toHaveBeenCalledWith('chat-1', 'hello', {
        parse_mode: 'Markdown',
      });
    });

    it('should log error when send fails', async () => {
      mockSendMessage.mockRejectedValueOnce(new Error('network'));
      const service = await createService({
        isEnabled: true,
        values: { TELEGRAM_BOT_TOKEN: 'bot-token' },
      });

      await expect(service.sendMessage('chat-1', 'hello')).rejects.toThrow();

      expect(mockLoggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to send message to chat-1'),
        expect.any(Error),
        expect.any(Object),
      );
    });
  });
});
