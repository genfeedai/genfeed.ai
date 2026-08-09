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

  it('should be defined', async () => {
    const service = await createService({ isEnabled: false });
    expect(service).toBeDefined();
  });

  describe('initialization', () => {
    it('should log when Telegram is not enabled', async () => {
      await createService({ isEnabled: false });

      expect(mockLoggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('skipping initialization'),
        expect.any(Object),
      );
    });

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

    it('should initialize bot when enabled with a token', async () => {
      await createService({
        isEnabled: true,
        values: { TELEGRAM_BOT_TOKEN: 'bot-token' },
      });

      expect(mockLoggerService.log).toHaveBeenCalledWith(
        expect.stringContaining('initialized'),
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
    it('should return true for admin users', async () => {
      const service = await createService({ isEnabled: false });
      expect(service.isAdmin(123)).toBe(true);
    });

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

      await service.sendMessage('chat-1', 'hello');

      expect(mockLoggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to send message to chat-1'),
        expect.any(Error),
        expect.any(Object),
      );
    });
  });

  describe('sendPhoto', () => {
    it('should warn and skip when bot is not initialized', async () => {
      const service = await createService({ isEnabled: false });

      await service.sendPhoto('chat-1', 'https://cdn/img.png', 'caption');

      expect(mockSendPhoto).not.toHaveBeenCalled();
      expect(mockLoggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('Bot not initialized'),
        expect.any(Object),
      );
    });

    it('should send a photo with caption via the bot api', async () => {
      const service = await createService({
        isEnabled: true,
        values: { TELEGRAM_BOT_TOKEN: 'bot-token' },
      });

      await service.sendPhoto('chat-1', 'https://cdn/img.png', 'caption');

      expect(mockSendPhoto).toHaveBeenCalledWith(
        'chat-1',
        'https://cdn/img.png',
        { caption: 'caption', parse_mode: 'Markdown' },
      );
    });

    it('should log error when photo send fails', async () => {
      mockSendPhoto.mockRejectedValueOnce(new Error('network'));
      const service = await createService({
        isEnabled: true,
        values: { TELEGRAM_BOT_TOKEN: 'bot-token' },
      });

      await service.sendPhoto('chat-1', 'https://cdn/img.png');

      expect(mockLoggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to send photo to chat-1'),
        expect.any(Error),
        expect.any(Object),
      );
    });
  });

  describe('sendVideo', () => {
    it('should warn and skip when bot is not initialized', async () => {
      const service = await createService({ isEnabled: false });

      await service.sendVideo('chat-1', 'https://cdn/vid.mp4');

      expect(mockSendVideo).not.toHaveBeenCalled();
      expect(mockLoggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('Bot not initialized'),
        expect.any(Object),
      );
    });

    it('should send a video with caption via the bot api', async () => {
      const service = await createService({
        isEnabled: true,
        values: { TELEGRAM_BOT_TOKEN: 'bot-token' },
      });

      await service.sendVideo('chat-1', 'https://cdn/vid.mp4', 'caption');

      expect(mockSendVideo).toHaveBeenCalledWith(
        'chat-1',
        'https://cdn/vid.mp4',
        { caption: 'caption', parse_mode: 'Markdown' },
      );
    });

    it('should log error when video send fails', async () => {
      mockSendVideo.mockRejectedValueOnce(new Error('network'));
      const service = await createService({
        isEnabled: true,
        values: { TELEGRAM_BOT_TOKEN: 'bot-token' },
      });

      await service.sendVideo('chat-1', 'https://cdn/vid.mp4');

      expect(mockLoggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to send video to chat-1'),
        expect.any(Error),
        expect.any(Object),
      );
    });
  });
});
