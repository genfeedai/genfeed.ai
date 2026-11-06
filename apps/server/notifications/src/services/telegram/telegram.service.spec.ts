import type { LoggerService } from '@libs/logger/logger.service';
import type { ConfigService } from '@notifications/config/config.service';
import { TelegramService } from '@notifications/services/telegram/telegram.service';

// Telegram as the service sees it: the bots created and the messages delivered.
const telegram = vi.hoisted(() => ({
  bots: [] as Array<{ options: unknown; token: string }>,
  delivered: [] as Array<{ chatId: string; options?: unknown; text: string }>,
  isDown: false,
  rejectsToken: false,
}));

vi.mock('grammy', () => ({
  Bot: class {
    readonly api = {
      sendMessage: async (chatId: string, text: string, options?: unknown) => {
        if (telegram.isDown) throw new Error('network');
        telegram.delivered.push({ chatId, options, text });
      },
    };

    constructor(token: string, options: unknown) {
      if (telegram.rejectsToken) throw new Error('Invalid token');
      telegram.bots.push({ options, token });
    }
  },
}));

describe('TelegramService', () => {
  let logs: Array<{ level: string; message: string }>;

  function createService(config: {
    isEnabled: boolean;
    token?: string;
  }): TelegramService {
    const record = (level: string) => (message: string) => {
      logs.push({ level, message });
    };
    return new TelegramService(
      {
        get: (key: string) =>
          key === 'TELEGRAM_BOT_TOKEN' ? config.token : undefined,
        isTelegramEnabled: () => config.isEnabled,
      } as unknown as ConfigService,
      {
        error: record('error'),
        log: record('log'),
        warn: record('warn'),
      } as unknown as LoggerService,
    );
  }

  beforeEach(() => {
    telegram.bots.length = 0;
    telegram.delivered.length = 0;
    telegram.isDown = false;
    telegram.rejectsToken = false;
    logs = [];
  });

  describe('initialization', () => {
    it.each([
      [
        'disabled',
        { isEnabled: false },
        {
          level: 'log',
          message: 'Telegram bot not configured - skipping initialization',
        },
      ],
      [
        'enabled without a token',
        { isEnabled: true },
        {
          level: 'warn',
          message: 'Telegram bot enabled but TELEGRAM_BOT_TOKEN is missing',
        },
      ],
    ])('creates no bot when %s', (_label, config, expectedLog) => {
      createService(config);

      expect(telegram.bots).toEqual([]);
      expect(logs).toEqual([expectedLog]);
    });

    it('creates an API-only bot with a short client timeout', () => {
      createService({ isEnabled: true, token: 'bot-token' });

      expect(telegram.bots).toEqual([
        { options: { client: { timeoutSeconds: 10 } }, token: 'bot-token' },
      ]);
    });

    it('logs instead of throwing when the token is rejected', () => {
      telegram.rejectsToken = true;

      expect(() =>
        createService({ isEnabled: true, token: 'bad-token' }),
      ).not.toThrow();
      expect(logs).toEqual([
        { level: 'error', message: 'Failed to initialize Telegram bot' },
      ]);
    });
  });

  describe('sendMessage', () => {
    it('returns false and sends nothing when no bot exists', async () => {
      const service = createService({ isEnabled: false });

      await expect(service.sendMessage('chat-1', 'hello')).resolves.toBe(false);
      expect(telegram.delivered).toEqual([]);
    });

    it('delivers a markdown message', async () => {
      const service = createService({ isEnabled: true, token: 'bot-token' });

      await expect(service.sendMessage('chat-1', 'hello')).resolves.toBe(true);
      expect(telegram.delivered).toEqual([
        {
          chatId: 'chat-1',
          options: { parse_mode: 'Markdown' },
          text: 'hello',
        },
      ]);
    });

    it('logs and rethrows a delivery failure', async () => {
      const service = createService({ isEnabled: true, token: 'bot-token' });
      telegram.isDown = true;

      await expect(service.sendMessage('chat-1', 'hello')).rejects.toThrow(
        'network',
      );
      expect(logs.at(-1)).toEqual({
        level: 'error',
        message: expect.stringContaining('Failed to send message to chat-1'),
      });
    });
  });

  describe('sendSystemMessage', () => {
    it('delivers plain text', async () => {
      const service = createService({ isEnabled: true, token: 'bot-token' });

      await service.sendSystemMessage('chat-1', 'deploy done');

      expect(telegram.delivered).toEqual([
        { chatId: 'chat-1', options: undefined, text: 'deploy done' },
      ]);
    });

    it.each([
      ['no bot exists', false, false, 'Telegram is not configured'],
      ['delivery fails', true, true, 'Telegram system notification failed'],
    ])('throws when %s', async (_label, isEnabled, isDown, message) => {
      const service = createService({ isEnabled, token: 'bot-token' });
      telegram.isDown = isDown;

      await expect(
        service.sendSystemMessage('chat-1', 'deploy done'),
      ).rejects.toThrow(message);
    });
  });
});
