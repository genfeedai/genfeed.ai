import { ConfigService } from '@api/config/config.service';
import { DiscordBotAdapter } from '@api/services/bot-gateway/adapters/discord-bot.adapter';
import { SlackBotAdapter } from '@api/services/bot-gateway/adapters/slack-bot.adapter';
import { TelegramBotAdapter } from '@api/services/bot-gateway/adapters/telegram-bot.adapter';
import { BotGatewayService } from '@api/services/bot-gateway/bot-gateway.service';
import { BotGenerationService } from '@api/services/bot-gateway/services/bot-generation.service';
import { BotUserResolverService } from '@api/services/bot-gateway/services/bot-user-resolver.service';
import {
  BotCommandType,
  BotResponseType,
  CredentialPlatform,
} from '@genfeedai/enums';
import type {
  IBotCallbackContext,
  IBotMessage,
  IBotPlatformAdapter,
  IBotResolvedUser,
} from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpException } from '@nestjs/common';
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

interface MockUserResolver {
  getUserBrands: ReturnType<typeof vi.fn>;
  resolveUser: ReturnType<typeof vi.fn>;
  resolveUserWithBrand: ReturnType<typeof vi.fn>;
}

interface MockGenerationService {
  checkCredits: ReturnType<typeof vi.fn>;
  getCallbackContext: ReturnType<typeof vi.fn>;
  getCreditCost: ReturnType<typeof vi.fn>;
  removeCallbackContext: ReturnType<typeof vi.fn>;
  triggerGeneration: ReturnType<typeof vi.fn>;
}

describe('BotGatewayService', () => {
  let service: BotGatewayService;
  let discordAdapter: MockAdapter;
  let telegramAdapter: MockAdapter;
  let userResolverService: MockUserResolver;
  let generationService: MockGenerationService;

  beforeEach(async () => {
    discordAdapter = createMockAdapter();
    const slackAdapter = createMockAdapter();
    telegramAdapter = createMockAdapter();

    const mockUserResolver: MockUserResolver = {
      getUserBrands: vi.fn().mockResolvedValue([]),
      resolveUser: vi.fn(),
      resolveUserWithBrand: vi.fn(),
    };

    const mockGeneration: MockGenerationService = {
      checkCredits: vi.fn(),
      getCallbackContext: vi.fn(),
      getCreditCost: vi.fn().mockReturnValue(10),
      removeCallbackContext: vi.fn(),
      triggerGeneration: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BotGatewayService,
        {
          provide: ConfigService,
          useValue: { get: vi.fn().mockReturnValue('http://localhost') },
        },
        {
          provide: LoggerService,
          useValue: {
            debug: vi.fn(),
            error: vi.fn(),
            log: vi.fn(),
            warn: vi.fn(),
          },
        },
        { provide: DiscordBotAdapter, useValue: discordAdapter },
        { provide: SlackBotAdapter, useValue: slackAdapter },
        { provide: TelegramBotAdapter, useValue: telegramAdapter },
        {
          provide: BotUserResolverService,
          useValue: mockUserResolver,
        },
        {
          provide: BotGenerationService,
          useValue: mockGeneration,
        },
      ],
    }).compile();

    service = module.get<BotGatewayService>(BotGatewayService);
    userResolverService = module.get(BotUserResolverService);
    generationService = module.get(BotGenerationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ── getAdapter ───────────────────────────────────────────────────────

  describe('getAdapter', () => {
    it('returns the discord adapter', () => {
      const adapter = service.getAdapter(CredentialPlatform.DISCORD);
      expect(adapter).toBeDefined();
    });

    it('returns undefined for unsupported platform', () => {
      const adapter = service.getAdapter(
        'whatsapp' as unknown as CredentialPlatform,
      );
      expect(adapter).toBeUndefined();
    });
  });

  // ── handlePing ───────────────────────────────────────────────────────

  describe('handlePing', () => {
    it('returns PONG response for discord', () => {
      discordAdapter.buildImmediateResponse.mockReturnValue({
        type: BotResponseType.PONG,
      });

      const result = service.handlePing(CredentialPlatform.DISCORD);

      expect(discordAdapter.buildImmediateResponse).toHaveBeenCalledWith(
        BotResponseType.PONG,
      );
      expect(result).toEqual({ type: BotResponseType.PONG });
    });

    it('throws HttpException for unsupported platform', () => {
      expect(() =>
        service.handlePing('whatsapp' as unknown as CredentialPlatform),
      ).toThrow(HttpException);
    });
  });

  // ── handleInteraction ────────────────────────────────────────────────

  describe('handleInteraction', () => {
    it('throws HttpException for unsupported platform', async () => {
      await expect(
        service.handleInteraction(
          'whatsapp' as unknown as CredentialPlatform,
          {},
        ),
      ).rejects.toThrow(HttpException);
    });

    it('returns error when message cannot be parsed', async () => {
      discordAdapter.parseMessage.mockResolvedValue(null);

      const result = await service.handleInteraction(
        CredentialPlatform.DISCORD,
        {},
      );

      expect(result.type).toBe('error');
      expect(result.message).toContain('Could not understand');
    });

    it('returns error for unknown command', async () => {
      const msg: IBotMessage = {
        chatId: 'ch-1',
        command: 'unknown-cmd' as BotCommandType,
        platform: CredentialPlatform.DISCORD,
        platformUserId: 'u-1',
      };
      discordAdapter.parseMessage.mockResolvedValue(msg);

      const result = await service.handleInteraction(
        CredentialPlatform.DISCORD,
        {},
      );

      expect(result.type).toBe('error');
      expect(result.message).toBe('Unknown command');
    });

    it('returns text when prompt is missing for generation command', async () => {
      const msg: IBotMessage = {
        chatId: 'ch-1',
        command: BotCommandType.PROMPT_IMAGE,
        platform: CredentialPlatform.DISCORD,
        platformUserId: 'u-1',
        prompt: '',
      };
      discordAdapter.parseMessage.mockResolvedValue(msg);

      const result = await service.handleInteraction(
        CredentialPlatform.DISCORD,
        {},
      );

      expect(result.type).toBe('text');
      expect(result.message).toContain('provide a prompt');
    });

    it('returns link message when user is not connected', async () => {
      const msg: IBotMessage = {
        chatId: 'ch-1',
        command: BotCommandType.PROMPT_IMAGE,
        platform: CredentialPlatform.DISCORD,
        platformUserId: 'u-1',
        prompt: 'a cat',
      };
      discordAdapter.parseMessage.mockResolvedValue(msg);
      userResolverService.resolveUserWithBrand.mockResolvedValue(null);

      const result = await service.handleInteraction(
        CredentialPlatform.DISCORD,
        {},
      );

      expect(result.type).toBe('text');
      expect(result.message).toContain('not connected');
    });

    it('returns insufficient credits message', async () => {
      const resolvedUser: IBotResolvedUser = {
        brandId: 'b-1',
        credentialId: 'c-1',
        organizationId: 'org-1',
        userId: 'u-1',
      };
      const msg: IBotMessage = {
        chatId: 'ch-1',
        command: BotCommandType.PROMPT_IMAGE,
        platform: CredentialPlatform.DISCORD,
        platformUserId: 'u-1',
        prompt: 'a cat',
      };
      discordAdapter.parseMessage.mockResolvedValue(msg);
      userResolverService.resolveUserWithBrand.mockResolvedValue(resolvedUser);
      generationService.getCreditCost.mockReturnValue(10);
      generationService.checkCredits.mockResolvedValue({
        balance: 5,
        hasCredits: false,
      });

      const result = await service.handleInteraction(
        CredentialPlatform.DISCORD,
        {},
      );

      expect(result.type).toBe('text');
      expect(result.message).toContain('Insufficient credits');
      expect(result.message).toContain('5');
    });

    it('triggers generation and returns deferred response', async () => {
      const resolvedUser: IBotResolvedUser = {
        brandId: 'b-1',
        credentialId: 'c-1',
        organizationId: 'org-1',
        userId: 'u-1',
      };
      const msg: IBotMessage = {
        applicationId: 'app-1',
        chatId: 'ch-1',
        command: BotCommandType.PROMPT_IMAGE,
        interactionToken: 'tok-1',
        platform: CredentialPlatform.DISCORD,
        platformUserId: 'u-1',
        prompt: 'a beautiful sunset',
      };
      discordAdapter.parseMessage.mockResolvedValue(msg);
      userResolverService.resolveUserWithBrand.mockResolvedValue(resolvedUser);
      generationService.getCreditCost.mockReturnValue(10);
      generationService.checkCredits.mockResolvedValue({
        balance: 100,
        hasCredits: true,
      });
      generationService.triggerGeneration.mockResolvedValue({
        ingredientId: 'ing-1',
        message: 'Generating your image...',
      });

      const result = await service.handleInteraction(
        CredentialPlatform.DISCORD,
        {},
      );

      expect(result.type).toBe('deferred');
      expect(generationService.triggerGeneration).toHaveBeenCalledWith(
        resolvedUser,
        BotCommandType.PROMPT_IMAGE,
        'a beautiful sunset',
        expect.objectContaining({
          applicationId: 'app-1',
          chatId: 'ch-1',
          interactionToken: 'tok-1',
          platform: CredentialPlatform.DISCORD,
        }),
      );
    });

    it('returns error when generation throws', async () => {
      const resolvedUser: IBotResolvedUser = {
        brandId: 'b-1',
        credentialId: 'c-1',
        organizationId: 'org-1',
        userId: 'u-1',
      };
      const msg: IBotMessage = {
        chatId: 'ch-1',
        command: BotCommandType.PROMPT_VIDEO,
        platform: CredentialPlatform.DISCORD,
        platformUserId: 'u-1',
        prompt: 'a dancing cat',
      };
      discordAdapter.parseMessage.mockResolvedValue(msg);
      userResolverService.resolveUserWithBrand.mockResolvedValue(resolvedUser);
      generationService.getCreditCost.mockReturnValue(20);
      generationService.checkCredits.mockResolvedValue({
        balance: 100,
        hasCredits: true,
      });
      generationService.triggerGeneration.mockRejectedValue(
        new Error('GPU unavailable'),
      );

      const result = await service.handleInteraction(
        CredentialPlatform.DISCORD,
        {},
      );

      expect(result.type).toBe('error');
      expect(result.message).toContain('Failed to start generation');
    });
  });

  // ── sendCompletionResponse ───────────────────────────────────────────

  describe('sendCompletionResponse', () => {
    it('does nothing when no callback context exists', async () => {
      generationService.getCallbackContext.mockReturnValue(undefined);

      await service.sendCompletionResponse(
        'ing-missing',
        'https://cdn.example.com/img.png',
        'image',
      );

      expect(discordAdapter.sendFollowupMedia).not.toHaveBeenCalled();
    });

    it('sends media and cleans up context on success', async () => {
      const ctx: IBotCallbackContext = {
        applicationId: 'app-1',
        chatId: 'ch-1',
        interactionToken: 'tok-1',
        platform: CredentialPlatform.DISCORD,
      };
      generationService.getCallbackContext.mockReturnValue(ctx);

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
      expect(generationService.removeCallbackContext).toHaveBeenCalledWith(
        'ing-1',
      );
    });
  });

  // ── sendErrorResponse ────────────────────────────────────────────────

  describe('sendErrorResponse', () => {
    it('sends error followup and cleans up context', async () => {
      const ctx: IBotCallbackContext = {
        applicationId: 'app-1',
        chatId: 'ch-1',
        interactionToken: 'tok-1',
        platform: CredentialPlatform.TELEGRAM,
      };
      generationService.getCallbackContext.mockReturnValue(ctx);

      await service.sendErrorResponse('ing-1', 'Out of memory');

      expect(telegramAdapter.sendFollowupMessage).toHaveBeenCalledWith(
        'app-1',
        'tok-1',
        'Generation failed: Out of memory',
      );
      expect(generationService.removeCallbackContext).toHaveBeenCalledWith(
        'ing-1',
      );
    });
  });
});
