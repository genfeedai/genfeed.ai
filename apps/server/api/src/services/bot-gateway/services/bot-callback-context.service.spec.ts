import { BotCallbackContextService } from '@api/services/bot-gateway/services/bot-callback-context.service';
import { CredentialPlatform } from '@genfeedai/contracts';
import type { IBotCallbackContext } from '@genfeedai/contracts/interfaces';
import { RedisService } from '@libs/redis/redis.service';
import { ServiceUnavailableException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

describe('BotCallbackContextService', () => {
  const ingredientId = 'ingredient-1';
  const key = `bot-generation:callback:${ingredientId}`;
  const callbackContext: IBotCallbackContext = {
    applicationId: 'app-1',
    chatId: 'chat-1',
    interactionToken: 'token-1',
    platform: CredentialPlatform.DISCORD,
  };

  let service: BotCallbackContextService;
  let publisher: {
    get: ReturnType<typeof vi.fn>;
    setex: ReturnType<typeof vi.fn>;
    unlink: ReturnType<typeof vi.fn>;
  };
  let redisValues: Map<string, string>;

  beforeEach(async () => {
    redisValues = new Map();
    publisher = {
      get: vi.fn(async (redisKey: string) => redisValues.get(redisKey) ?? null),
      setex: vi.fn(async (redisKey: string, _ttl: number, value: string) => {
        redisValues.set(redisKey, value);
        return 'OK';
      }),
      unlink: vi.fn(async (redisKey: string) =>
        Number(redisValues.delete(redisKey)),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BotCallbackContextService,
        {
          provide: RedisService,
          useValue: { getPublisher: vi.fn(() => publisher) },
        },
      ],
    }).compile();

    service = module.get(BotCallbackContextService);
  });

  it('stores the context with the ingredient id under a 24h TTL', async () => {
    await service.store(ingredientId, callbackContext);

    expect(publisher.setex).toHaveBeenCalledWith(
      key,
      86_400,
      JSON.stringify({ ...callbackContext, ingredientId }),
    );
    await expect(service.get(ingredientId)).resolves.toEqual({
      ...callbackContext,
      ingredientId,
    });
  });

  it('returns undefined when nothing is stored', async () => {
    await expect(service.get('missing')).resolves.toBeUndefined();
  });

  it('ignores stored values that are not a bot callback context', async () => {
    redisValues.set(key, JSON.stringify({ platform: 'whatsapp' }));

    await expect(service.get(ingredientId)).resolves.toBeUndefined();
  });

  it('removes the context after delivery', async () => {
    redisValues.set(key, JSON.stringify(callbackContext));

    await service.remove(ingredientId);

    expect(publisher.unlink).toHaveBeenCalledWith(key);
    await expect(service.get(ingredientId)).resolves.toBeUndefined();
  });

  it('fails closed when Redis is not configured', async () => {
    const module = await Test.createTestingModule({
      providers: [
        BotCallbackContextService,
        {
          provide: RedisService,
          useValue: { getPublisher: vi.fn(() => undefined) },
        },
      ],
    }).compile();
    const unavailableService = module.get(BotCallbackContextService);

    await expect(
      unavailableService.store(ingredientId, callbackContext),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(unavailableService.get(ingredientId)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
