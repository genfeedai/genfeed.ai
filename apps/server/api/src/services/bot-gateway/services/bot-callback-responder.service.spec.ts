import { DiscordBotAdapter } from '@api/services/bot-gateway/adapters/discord-bot.adapter';
import { SlackBotAdapter } from '@api/services/bot-gateway/adapters/slack-bot.adapter';
import { TelegramBotAdapter } from '@api/services/bot-gateway/adapters/telegram-bot.adapter';
import { BotCallbackContextService } from '@api/services/bot-gateway/services/bot-callback-context.service';
import { BotCallbackResponderService } from '@api/services/bot-gateway/services/bot-callback-responder.service';
import { BotPlatformAdapterRegistryService } from '@api/services/bot-gateway/services/bot-platform-adapter-registry.service';
import { CredentialPlatform } from '@genfeedai/contracts';
import type {
  IBotCallbackContext,
  IBotPlatformAdapter,
} from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { Test, type TestingModule } from '@nestjs/testing';

type MockAdapter = {
  [K in keyof IBotPlatformAdapter]: ReturnType<typeof vi.fn>;
};

type StoredRedisValue = {
  expiresAtMs: number;
  value: string;
};

const createMockAdapter = (): MockAdapter => ({
  buildImmediateResponse: vi.fn().mockReturnValue({ type: 1 }),
  getInteractionType: vi.fn(),
  parseMessage: vi.fn(),
  platform: vi.fn(),
  sendFollowupMedia: vi.fn().mockResolvedValue(undefined),
  sendFollowupMessage: vi.fn().mockResolvedValue(undefined),
  validateSignature: vi.fn().mockResolvedValue(true),
});

function createPublisher(store: Map<string, StoredRedisValue>) {
  return {
    eval: vi.fn(async (_script: string, _numKeys: number, key: string) => {
      const entry = store.get(key);
      if (!entry) {
        return null;
      }

      const remainingTtlMs = Number.isFinite(entry.expiresAtMs)
        ? Math.max(0, entry.expiresAtMs - Date.now())
        : -1;
      store.delete(key);
      return [entry.value, remainingTtlMs];
    }),
    get: vi.fn(async (key: string) => store.get(key)?.value ?? null),
    set: vi.fn(
      async (
        key: string,
        value: string,
        mode?: string,
        ttl?: number,
        nx?: string,
      ) => {
        const isNx = mode === 'NX' || nx === 'NX';
        if (isNx && store.has(key)) {
          return null;
        }

        let expiresAtMs = Number.POSITIVE_INFINITY;
        if (mode === 'PX' && typeof ttl === 'number') {
          expiresAtMs = Date.now() + ttl;
        }

        store.set(key, { expiresAtMs, value });
        return 'OK';
      },
    ),
    setex: vi.fn(async (key: string, ttl: number, value: string) => {
      store.set(key, {
        expiresAtMs: Date.now() + ttl * 1000,
        value,
      });
      return 'OK';
    }),
  };
}

describe('BotCallbackResponderService', () => {
  const ingredientId = 'ing-1';
  const resultUrl = 'https://cdn.example.com/video.mp4';
  const discordContext: IBotCallbackContext = {
    applicationId: 'app-1',
    chatId: 'ch-1',
    interactionToken: 'tok-1',
    platform: CredentialPlatform.DISCORD,
  };
  const telegramContext: IBotCallbackContext = {
    applicationId: 'app-1',
    chatId: 'ch-1',
    interactionToken: 'tok-1',
    platform: CredentialPlatform.TELEGRAM,
  };

  let service: BotCallbackResponderService;
  let discordAdapter: MockAdapter;
  let telegramAdapter: MockAdapter;
  let adapterRegistry: BotPlatformAdapterRegistryService;
  let callbackContextService: BotCallbackContextService;
  let loggerService: {
    error: ReturnType<typeof vi.fn>;
    warn: ReturnType<typeof vi.fn>;
  };
  let publisher: ReturnType<typeof createPublisher>;

  beforeEach(async () => {
    discordAdapter = createMockAdapter();
    const slackAdapter = createMockAdapter();
    telegramAdapter = createMockAdapter();
    publisher = createPublisher(new Map());
    loggerService = { error: vi.fn(), warn: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BotCallbackResponderService,
        BotCallbackContextService,
        {
          provide: BotPlatformAdapterRegistryService,
          useValue: new BotPlatformAdapterRegistryService(
            discordAdapter as unknown as DiscordBotAdapter,
            slackAdapter as unknown as SlackBotAdapter,
            telegramAdapter as unknown as TelegramBotAdapter,
          ),
        },
        {
          provide: RedisService,
          useValue: { getPublisher: vi.fn(() => publisher) },
        },
        {
          provide: LoggerService,
          useValue: { ...loggerService, log: vi.fn() },
        },
      ],
    }).compile();

    service = module.get(BotCallbackResponderService);
    adapterRegistry = module.get(BotPlatformAdapterRegistryService);
    callbackContextService = module.get(BotCallbackContextService);
    loggerService = module.get(LoggerService);
  });

  describe('sendCompletionResponse', () => {
    it('does nothing when no callback context exists', async () => {
      await service.sendCompletionResponse(ingredientId, resultUrl, 'image');

      expect(discordAdapter.sendFollowupMedia).not.toHaveBeenCalled();
    });

    it('sends media and consumes the context on success', async () => {
      await callbackContextService.store(ingredientId, discordContext);

      await service.sendCompletionResponse(ingredientId, resultUrl, 'video');

      expect(discordAdapter.sendFollowupMedia).toHaveBeenCalledWith(
        'app-1',
        'tok-1',
        resultUrl,
        'video',
        "Here's your generated video!",
      );
      await expect(
        callbackContextService.get(ingredientId),
      ).resolves.toBeUndefined();
    });

    it('restores the context when the adapter fails before the platform accepts', async () => {
      await callbackContextService.store(ingredientId, discordContext);
      discordAdapter.sendFollowupMedia.mockRejectedValue(new Error('boom'));

      await service.sendCompletionResponse(ingredientId, resultUrl, 'video');

      await expect(callbackContextService.get(ingredientId)).resolves.toEqual({
        ...discordContext,
        ingredientId,
      });
      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('failed to send completion'),
        expect.any(Error),
      );
      expect(loggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining(
          'restoring callback context after failed delivery',
        ),
        { ingredientId },
      );
    });

    it('delivers exactly one follow-up when two completions race', async () => {
      await callbackContextService.store(ingredientId, discordContext);

      await Promise.all([
        service.sendCompletionResponse(ingredientId, resultUrl, 'image'),
        service.sendCompletionResponse(ingredientId, resultUrl, 'image'),
      ]);

      expect(discordAdapter.sendFollowupMedia).toHaveBeenCalledTimes(1);
      await expect(
        callbackContextService.get(ingredientId),
      ).resolves.toBeUndefined();
    });
  });

  describe('sendErrorResponse', () => {
    it('sends error followup and consumes the context', async () => {
      await callbackContextService.store(ingredientId, telegramContext);

      await service.sendErrorResponse(ingredientId, 'Out of memory');

      expect(telegramAdapter.sendFollowupMessage).toHaveBeenCalledWith(
        'app-1',
        'tok-1',
        'Generation failed: Out of memory',
      );
      await expect(
        callbackContextService.get(ingredientId),
      ).resolves.toBeUndefined();
    });

    it('logs, restores, and returns when the platform has no adapter', async () => {
      await callbackContextService.store(ingredientId, discordContext);
      vi.spyOn(adapterRegistry, 'getAdapter').mockReturnValue(undefined);

      await service.sendErrorResponse(ingredientId, 'Out of memory');

      expect(telegramAdapter.sendFollowupMessage).not.toHaveBeenCalled();
      expect(discordAdapter.sendFollowupMessage).not.toHaveBeenCalled();
      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('no adapter for platform'),
        { platform: CredentialPlatform.DISCORD },
      );
      await expect(callbackContextService.get(ingredientId)).resolves.toEqual({
        ...discordContext,
        ingredientId,
      });
    });

    it('delivers exactly one message when two failures race', async () => {
      await callbackContextService.store(ingredientId, telegramContext);

      await Promise.all([
        service.sendErrorResponse(ingredientId, 'Out of memory'),
        service.sendErrorResponse(ingredientId, 'Out of memory'),
      ]);

      expect(telegramAdapter.sendFollowupMessage).toHaveBeenCalledTimes(1);
      await expect(
        callbackContextService.get(ingredientId),
      ).resolves.toBeUndefined();
    });
  });
});
