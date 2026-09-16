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
import { Test, type TestingModule } from '@nestjs/testing';

type MockAdapter = {
  [K in keyof IBotPlatformAdapter]: ReturnType<typeof vi.fn>;
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

interface MockCallbackContextService {
  get: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  store: ReturnType<typeof vi.fn>;
}

describe('BotCallbackResponderService', () => {
  let service: BotCallbackResponderService;
  let discordAdapter: MockAdapter;
  let telegramAdapter: MockAdapter;
  let callbackContextService: MockCallbackContextService;
  let loggerService: { error: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    discordAdapter = createMockAdapter();
    const slackAdapter = createMockAdapter();
    telegramAdapter = createMockAdapter();
    callbackContextService = {
      get: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
      store: vi.fn().mockResolvedValue(undefined),
    };
    loggerService = { error: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BotCallbackResponderService,
        {
          provide: BotPlatformAdapterRegistryService,
          useValue: new BotPlatformAdapterRegistryService(
            discordAdapter as unknown as DiscordBotAdapter,
            slackAdapter as unknown as SlackBotAdapter,
            telegramAdapter as unknown as TelegramBotAdapter,
          ),
        },
        {
          provide: BotCallbackContextService,
          useValue: callbackContextService,
        },
        {
          provide: LoggerService,
          useValue: { ...loggerService, log: vi.fn(), warn: vi.fn() },
        },
      ],
    }).compile();

    service = module.get(BotCallbackResponderService);
    loggerService = module.get(LoggerService);
  });

  describe('sendCompletionResponse', () => {
    it('does nothing when no callback context exists', async () => {
      await service.sendCompletionResponse(
        'ing-missing',
        'https://cdn.example.com/img.png',
        'image',
      );

      expect(discordAdapter.sendFollowupMedia).not.toHaveBeenCalled();
      expect(callbackContextService.remove).not.toHaveBeenCalled();
    });

    it('sends media and cleans up context on success', async () => {
      const ctx: IBotCallbackContext = {
        applicationId: 'app-1',
        chatId: 'ch-1',
        interactionToken: 'tok-1',
        platform: CredentialPlatform.DISCORD,
      };
      callbackContextService.get.mockResolvedValue(ctx);

      await service.sendCompletionResponse(
        'ing-1',
        'https://cdn.example.com/video.mp4',
        'video',
      );

      expect(discordAdapter.sendFollowupMedia).toHaveBeenCalledWith(
        'app-1',
        'tok-1',
        'https://cdn.example.com/video.mp4',
        'video',
        "Here's your generated video!",
      );
      expect(callbackContextService.remove).toHaveBeenCalledWith('ing-1');
    });

    it('keeps the context and logs when the adapter fails', async () => {
      const ctx: IBotCallbackContext = {
        applicationId: 'app-1',
        chatId: 'ch-1',
        interactionToken: 'tok-1',
        platform: CredentialPlatform.DISCORD,
      };
      callbackContextService.get.mockResolvedValue(ctx);
      discordAdapter.sendFollowupMedia.mockRejectedValue(new Error('boom'));

      await service.sendCompletionResponse(
        'ing-1',
        'https://cdn.example.com/video.mp4',
        'video',
      );

      expect(callbackContextService.remove).not.toHaveBeenCalled();
      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('failed to send completion'),
        expect.any(Error),
      );
    });
  });

  describe('sendErrorResponse', () => {
    it('sends error followup and cleans up context', async () => {
      const ctx: IBotCallbackContext = {
        applicationId: 'app-1',
        chatId: 'ch-1',
        interactionToken: 'tok-1',
        platform: CredentialPlatform.TELEGRAM,
      };
      callbackContextService.get.mockResolvedValue(ctx);

      await service.sendErrorResponse('ing-1', 'Out of memory');

      expect(telegramAdapter.sendFollowupMessage).toHaveBeenCalledWith(
        'app-1',
        'tok-1',
        'Generation failed: Out of memory',
      );
      expect(callbackContextService.remove).toHaveBeenCalledWith('ing-1');
    });

    it('logs and returns when the platform has no adapter', async () => {
      callbackContextService.get.mockResolvedValue({
        applicationId: 'app-1',
        chatId: 'ch-1',
        interactionToken: 'tok-1',
        platform: 'whatsapp' as unknown as CredentialPlatform,
      });

      await service.sendErrorResponse('ing-1', 'Out of memory');

      expect(telegramAdapter.sendFollowupMessage).not.toHaveBeenCalled();
      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('no adapter for platform'),
        { platform: 'whatsapp' },
      );
    });
  });
});
