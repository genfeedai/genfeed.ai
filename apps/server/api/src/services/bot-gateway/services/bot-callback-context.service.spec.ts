import { BotCallbackContextService } from '@api/services/bot-gateway/services/bot-callback-context.service';
import { CredentialPlatform } from '@genfeedai/contracts';
import type { IBotCallbackContext } from '@genfeedai/contracts/interfaces';
import { RedisService } from '@libs/redis/redis.service';
import { ServiceUnavailableException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';

type StoredRedisValue = {
  expiresAtMs: number;
  value: string;
};

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

describe('BotCallbackContextService', () => {
  const ingredientId = 'ingredient-1';
  const key = `bot-generation:callback:${ingredientId}`;
  const callbackContext: IBotCallbackContext = {
    applicationId: 'app-1',
    chatId: 'chat-1',
    interactionToken: 'token-1',
    platform: CredentialPlatform.DISCORD,
  };
  const storedContext = { ...callbackContext, ingredientId };

  let service: BotCallbackContextService;
  let publisher: ReturnType<typeof createPublisher>;
  let redisValues: Map<string, StoredRedisValue>;

  beforeEach(async () => {
    redisValues = new Map();
    publisher = createPublisher(redisValues);

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
      JSON.stringify(storedContext),
    );
    await expect(service.get(ingredientId)).resolves.toEqual(storedContext);
  });

  it('returns undefined when nothing is stored', async () => {
    await expect(service.get('missing')).resolves.toBeUndefined();
  });

  it('ignores stored values that are not a bot callback context', async () => {
    redisValues.set(key, {
      expiresAtMs: Date.now() + 86_400_000,
      value: JSON.stringify({ platform: 'whatsapp' }),
    });

    await expect(service.get(ingredientId)).resolves.toBeUndefined();
  });

  it('claims the record once and nothing on a second claim', async () => {
    await service.store(ingredientId, callbackContext);

    const first = await service.claim(ingredientId);
    const second = await service.claim(ingredientId);

    expect(publisher.eval).toHaveBeenCalledWith(
      expect.stringContaining('GETDEL'),
      1,
      key,
    );

    expect(first).toEqual({
      claimedAtMs: expect.any(Number),
      context: storedContext,
      remainingTtlMs: expect.any(Number),
    });
    expect(first?.remainingTtlMs).toBeGreaterThan(0);
    expect(first?.remainingTtlMs).toBeLessThanOrEqual(86_400_000);
    expect(second).toBeUndefined();
    await expect(service.get(ingredientId)).resolves.toBeUndefined();
  });

  it('consumes invalid stored values without returning them', async () => {
    redisValues.set(key, {
      expiresAtMs: Date.now() + 86_400_000,
      value: JSON.stringify({ platform: 'whatsapp' }),
    });

    await expect(service.claim(ingredientId)).resolves.toBeUndefined();
    await expect(service.get(ingredientId)).resolves.toBeUndefined();
  });

  it('restores remaining lifetime instead of a fresh 24h window', async () => {
    const remainingTtlMs = 12_000;
    redisValues.set(key, {
      expiresAtMs: Date.now() + remainingTtlMs,
      value: JSON.stringify(storedContext),
    });

    const claimed = await service.claim(ingredientId);
    expect(claimed).toBeDefined();
    if (!claimed) {
      throw new Error('expected claim to return the stored context');
    }

    const restored = await service.restore(ingredientId, claimed);

    expect(restored).toBe(true);
    expect(publisher.set).toHaveBeenCalledWith(
      key,
      JSON.stringify(storedContext),
      'PX',
      expect.any(Number),
      'NX',
    );
    const restoredTtlMs = publisher.set.mock.calls[0]?.[3];
    expect(restoredTtlMs).toBeGreaterThan(0);
    expect(restoredTtlMs).toBeLessThanOrEqual(claimed.remainingTtlMs);

    const reclaimed = await service.claim(ingredientId);
    expect(reclaimed?.remainingTtlMs).toBeLessThanOrEqual(remainingTtlMs);
    expect(reclaimed?.remainingTtlMs).toBeGreaterThan(0);
  });

  it('abandons restore when a newer record exists', async () => {
    const original = {
      ...callbackContext,
      interactionToken: 'original-token',
    };
    const newer = {
      ...callbackContext,
      interactionToken: 'newer-token',
    };

    await service.store(ingredientId, original);
    const claimed = await service.claim(ingredientId);
    expect(claimed).toBeDefined();
    if (!claimed) {
      throw new Error('expected claim to return the original context');
    }
    await service.store(ingredientId, newer);

    const restored = await service.restore(ingredientId, claimed);

    expect(restored).toBe(false);
    await expect(service.get(ingredientId)).resolves.toEqual({
      ...newer,
      ingredientId,
    });
  });

  it('does not restore an already-expired claim', async () => {
    await expect(
      service.restore(ingredientId, {
        claimedAtMs: Date.now() - 50,
        context: callbackContext,
        remainingTtlMs: 10,
      }),
    ).resolves.toBe(false);
    expect(publisher.set).not.toHaveBeenCalled();
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
    await expect(unavailableService.claim(ingredientId)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
