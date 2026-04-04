import { ConfigService } from '@api/config/config.service';
import { TelegramBotAdapter } from '@api/services/bot-gateway/adapters/telegram-bot.adapter';
import {
  BotCommandType,
  BotInteractionType,
  BotResponseType,
  CredentialPlatform,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Test, type TestingModule } from '@nestjs/testing';
import { of } from 'rxjs';

const makeUpdate = (text?: string, chatId = '12345', fromId = '99') => ({
  message: {
    chat: { id: chatId },
    from: { id: fromId },
    text,
  },
  update_id: 1,
});

describe('TelegramBotAdapter', () => {
  let adapter: TelegramBotAdapter;
  let configService: vi.Mocked<Pick<ConfigService, 'get'>>;
  let httpService: vi.Mocked<Pick<HttpService, 'post'>>;
  let loggerService: vi.Mocked<Pick<LoggerService, 'log' | 'warn' | 'error'>>;

  const BOT_TOKEN = 'test-bot-token-abc';
  const WEBHOOK_SECRET = 'webhook-secret-xyz';

  beforeEach(async () => {
    configService = {
      get: vi.fn((key: string) => {
        if (key === 'TELEGRAM_BOT_TOKEN') return BOT_TOKEN;
        if (key === 'TELEGRAM_WEBHOOK_SECRET') return WEBHOOK_SECRET;
        return undefined;
      }),
    };
    httpService = { post: vi.fn().mockReturnValue(of({ data: {} })) };
    loggerService = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramBotAdapter,
        { provide: ConfigService, useValue: configService },
        { provide: HttpService, useValue: httpService },
        { provide: LoggerService, useValue: loggerService },
      ],
    }).compile();

    adapter = module.get<TelegramBotAdapter>(TelegramBotAdapter);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(adapter).toBeDefined();
  });

  it('has platform = TELEGRAM', () => {
    expect(adapter.platform).toBe(CredentialPlatform.TELEGRAM);
  });

  // ─────────────────────────── validateSignature ───────────────────────

  describe('validateSignature', () => {
    it('returns true for matching secret', () => {
      expect(adapter.validateSignature('', WEBHOOK_SECRET)).toBe(true);
    });

    it('returns false for wrong secret', () => {
      expect(adapter.validateSignature('', 'wrong-secret')).toBe(false);
    });

    it('returns false for empty signature when secret is configured', () => {
      expect(adapter.validateSignature('', '')).toBe(false);
    });

    it('returns true when webhookSecret not configured', async () => {
      configService.get.mockImplementation((key: string) => {
        if (key === 'TELEGRAM_BOT_TOKEN') return BOT_TOKEN;
        return undefined;
      });
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          TelegramBotAdapter,
          { provide: ConfigService, useValue: configService },
          { provide: HttpService, useValue: httpService },
          { provide: LoggerService, useValue: loggerService },
        ],
      }).compile();
      const noSecretAdapter =
        module.get<TelegramBotAdapter>(TelegramBotAdapter);
      expect(noSecretAdapter.validateSignature('body', 'anything')).toBe(true);
    });
  });

  // ─────────────────────────── getInteractionType ──────────────────────

  describe('getInteractionType', () => {
    it('returns APPLICATION_COMMAND for slash commands', () => {
      expect(adapter.getInteractionType(makeUpdate('/status'))).toBe(
        BotInteractionType.APPLICATION_COMMAND,
      );
    });

    it('returns null for plain text messages', () => {
      expect(adapter.getInteractionType(makeUpdate('hello'))).toBeNull();
    });

    it('returns null when no text', () => {
      expect(adapter.getInteractionType(makeUpdate())).toBeNull();
    });
  });

  // ───────────────────────────── parseMessage ──────────────────────────

  describe('parseMessage', () => {
    it('parses /status command', () => {
      const msg = adapter.parseMessage(makeUpdate('/status'));
      expect(msg?.command).toBe(BotCommandType.STATUS);
      expect(msg?.chatId).toBe('12345');
      expect(msg?.platformUserId).toBe('99');
      expect(msg?.platform).toBe(CredentialPlatform.TELEGRAM);
    });

    it('parses /set_brand command with brand name', () => {
      const msg = adapter.parseMessage(makeUpdate('/set_brand MyBrand'));
      expect(msg?.command).toBe(BotCommandType.SET_BRAND);
      expect(msg?.brandName).toBe('MyBrand');
    });

    it('parses /prompt_video with prompt text', () => {
      const msg = adapter.parseMessage(
        makeUpdate('/prompt_video a sunset over mountains'),
      );
      expect(msg?.command).toBe(BotCommandType.PROMPT_VIDEO);
      expect(msg?.prompt).toBe('a sunset over mountains');
    });

    it('returns null for unknown command', () => {
      const msg = adapter.parseMessage(makeUpdate('/unknown_cmd'));
      expect(msg).toBeNull();
    });

    it('returns null when chat.id is missing', () => {
      const body = {
        message: { from: { id: '1' }, text: '/status' },
        update_id: 1,
      };
      expect(adapter.parseMessage(body)).toBeNull();
    });

    it('handles edited_message fallback', () => {
      const body = {
        edited_message: {
          chat: { id: '888' },
          from: { id: '777' },
          text: '/status',
        },
        update_id: 2,
      };
      const msg = adapter.parseMessage(body);
      expect(msg?.chatId).toBe('888');
    });
  });

  // ──────────────────────── buildImmediateResponse ─────────────────────

  describe('buildImmediateResponse', () => {
    it('returns ok:true with default message', () => {
      const res = adapter.buildImmediateResponse(BotResponseType.DEFERRED);
      expect(res).toEqual({ message: 'ok', ok: true });
    });

    it('returns provided message text', () => {
      const res = adapter.buildImmediateResponse(
        BotResponseType.DEFERRED,
        'processing',
      );
      expect(res).toEqual({ message: 'processing', ok: true });
    });
  });

  // ──────────────────────── sendFollowupMessage ────────────────────────

  describe('sendFollowupMessage', () => {
    it('calls Telegram sendMessage endpoint', async () => {
      await adapter.sendFollowupMessage('', '12345', 'Hello!');
      expect(httpService.post).toHaveBeenCalledWith(
        expect.stringContaining('/sendMessage'),
        expect.objectContaining({ chat_id: '12345', text: 'Hello!' }),
        expect.any(Object),
      );
    });

    it('throws when bot token is not configured', async () => {
      configService.get.mockReturnValue(undefined);
      const module2: TestingModule = await Test.createTestingModule({
        providers: [
          TelegramBotAdapter,
          { provide: ConfigService, useValue: configService },
          { provide: HttpService, useValue: httpService },
          { provide: LoggerService, useValue: loggerService },
        ],
      }).compile();
      const noTokenAdapter =
        module2.get<TelegramBotAdapter>(TelegramBotAdapter);
      await expect(
        noTokenAdapter.sendFollowupMessage('', '123', 'msg'),
      ).rejects.toThrow('TELEGRAM_BOT_TOKEN is not configured');
    });
  });

  // ─────────────────────────── extractChatId ───────────────────────────

  describe('extractChatId', () => {
    it('extracts chat id from message', () => {
      expect(adapter.extractChatId(makeUpdate('/status', '42'))).toBe('42');
    });

    it('returns null when no message', () => {
      expect(adapter.extractChatId({ update_id: 1 })).toBeNull();
    });
  });
});
