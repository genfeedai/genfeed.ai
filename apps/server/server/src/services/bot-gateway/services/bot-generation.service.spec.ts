import {
  BotCommandType,
  CredentialPlatform,
  IngredientCategory,
} from '@genfeedai/enums';
import type {
  IBotCallbackContext,
  IBotResolvedUser,
} from '@genfeedai/interfaces';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { ServiceUnavailableException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { CreditsUtilsService } from '@server/collections/credits/services/credits.utils.service';
import { BotGenerationService } from '@server/services/bot-gateway/services/bot-generation.service';
import {
  BOT_MEDIA_GENERATION_DISPATCHER,
  type BotMediaGenerationDispatcher,
} from '@server/services/bot-gateway/services/bot-media-generation-dispatcher.interface';
import type { Mocked } from 'vitest';

describe('BotGenerationService', () => {
  const ingredientId = 'ingredient-1';
  const user: IBotResolvedUser = {
    brandId: 'brand-1',
    credentialId: 'credential-1',
    organizationId: 'org-1',
    userId: 'user-1',
  };
  const callbackContext: IBotCallbackContext = {
    applicationId: 'app-1',
    chatId: 'chat-1',
    interactionToken: 'token-1',
    platform: CredentialPlatform.DISCORD,
  };

  let service: BotGenerationService;
  let creditsUtilsService: Mocked<
    Pick<CreditsUtilsService, 'getOrganizationCreditsBalance'>
  >;
  let dispatcher: Mocked<BotMediaGenerationDispatcher>;
  let publisher: {
    get: ReturnType<typeof vi.fn>;
    setex: ReturnType<typeof vi.fn>;
    unlink: ReturnType<typeof vi.fn>;
  };
  let redisValues: Map<string, string>;

  beforeEach(async () => {
    redisValues = new Map();
    publisher = {
      get: vi.fn(async (key: string) => redisValues.get(key) ?? null),
      setex: vi.fn(async (key: string, _ttl: number, value: string) => {
        redisValues.set(key, value);
        return 'OK';
      }),
      unlink: vi.fn(async (key: string) => Number(redisValues.delete(key))),
    };
    creditsUtilsService = {
      getOrganizationCreditsBalance: vi.fn().mockResolvedValue(100),
    };
    dispatcher = {
      generate: vi.fn(async (input) => {
        await input.onPlaceholderCreated(ingredientId);
        return { ingredientId };
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BotGenerationService,
        {
          provide: ConfigService,
          useValue: { ingredientsEndpoint: 'https://cdn.genfeed.ai' },
        },
        { provide: CreditsUtilsService, useValue: creditsUtilsService },
        {
          provide: LoggerService,
          useValue: { error: vi.fn(), log: vi.fn() },
        },
        {
          provide: RedisService,
          useValue: { getPublisher: vi.fn(() => publisher) },
        },
        { provide: BOT_MEDIA_GENERATION_DISPATCHER, useValue: dispatcher },
      ],
    }).compile();

    service = module.get(BotGenerationService);
  });

  it('reports the current organization credit balance', async () => {
    await expect(service.checkCredits('org-1', 20)).resolves.toEqual({
      balance: 100,
      hasCredits: true,
    });
  });

  it('fails the credit check closed when the balance lookup fails', async () => {
    creditsUtilsService.getOrganizationCreditsBalance.mockRejectedValue(
      new Error('database unavailable'),
    );

    await expect(service.checkCredits('org-1', 20)).resolves.toEqual({
      balance: 0,
      hasCredits: false,
    });
  });

  it.each([
    [BotCommandType.PROMPT_IMAGE, 'image'],
    [BotCommandType.PROMPT_VIDEO, 'video'],
  ])(
    'dispatches %s through the canonical media path',
    async (command, label) => {
      const result = await service.triggerGeneration(
        user,
        command,
        'a cinematic launch scene',
        callbackContext,
      );

      expect(dispatcher.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          command,
          prompt: 'a cinematic launch scene',
          user,
        }),
      );
      expect(result).toEqual({
        ingredientId,
        message: `Generating your ${label}...`,
      });
    },
  );

  it('persists callback context before provider dispatch continues', async () => {
    await service.triggerGeneration(
      user,
      BotCommandType.PROMPT_IMAGE,
      'a launch scene',
      callbackContext,
    );

    expect(publisher.setex).toHaveBeenCalledWith(
      `bot-generation:callback:${ingredientId}`,
      86_400,
      JSON.stringify({ ...callbackContext, ingredientId }),
    );
    await expect(service.getCallbackContext(ingredientId)).resolves.toEqual({
      ...callbackContext,
      ingredientId,
    });
  });

  it('removes callback context after delivery', async () => {
    redisValues.set(
      `bot-generation:callback:${ingredientId}`,
      JSON.stringify(callbackContext),
    );

    await service.removeCallbackContext(ingredientId);

    await expect(
      service.getCallbackContext(ingredientId),
    ).resolves.toBeUndefined();
  });

  it('rejects generation when durable callback storage is unavailable', async () => {
    const module = await Test.createTestingModule({
      providers: [
        BotGenerationService,
        { provide: ConfigService, useValue: {} },
        { provide: CreditsUtilsService, useValue: creditsUtilsService },
        { provide: LoggerService, useValue: { error: vi.fn(), log: vi.fn() } },
        {
          provide: RedisService,
          useValue: { getPublisher: vi.fn(() => undefined) },
        },
        { provide: BOT_MEDIA_GENERATION_DISPATCHER, useValue: dispatcher },
      ],
    }).compile();
    const unavailableService = module.get(BotGenerationService);

    await expect(
      unavailableService.triggerGeneration(
        user,
        BotCommandType.PROMPT_IMAGE,
        'a launch scene',
        callbackContext,
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('builds canonical ingredient URLs', () => {
    expect(service.getIngredientUrl('image-1', IngredientCategory.IMAGE)).toBe(
      'https://cdn.genfeed.ai/images/image-1',
    );
    expect(service.getIngredientUrl('video-1', IngredientCategory.VIDEO)).toBe(
      'https://cdn.genfeed.ai/videos/video-1',
    );
  });
});
