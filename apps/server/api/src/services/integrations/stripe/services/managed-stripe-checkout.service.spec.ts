vi.mock('@genfeedai/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@genfeedai/config')>();

  return {
    ...actual,
    isSelfHostedDeployment: () => true,
  };
});

import { CacheService } from '@api/services/cache/cache.service';
import { ManagedStripeCheckoutService } from '@api/services/integrations/stripe/services/managed-stripe-checkout.service';
import { StripeService } from '@api/services/integrations/stripe/services/stripe.service';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { ServiceUnavailableException } from '@nestjs/common';

const provisioned = {
  apiKey: 'gf_test_123',
  apiKeyAlreadyExists: false,
  brandId: 'brand_1',
  email: 'managed@example.com',
  organizationId: 'org_1',
  userId: 'user_1',
};

/** Cache double with real counter semantics for `incr`. */
function buildCache(stored: unknown) {
  const counters = new Map<string, number>();

  return {
    expire: vi.fn().mockResolvedValue(true),
    generateKey: (...parts: string[]) => parts.join(':'),
    get: vi.fn().mockResolvedValue(stored),
    incr: vi.fn(async (key: string) => {
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      return next;
    }),
  };
}

function buildService(cache: ReturnType<typeof buildCache>) {
  return new ManagedStripeCheckoutService(
    { get: vi.fn() } as unknown as ConfigService,
    {} as unknown as StripeService,
    cache as unknown as CacheService,
    { warn: vi.fn() } as unknown as LoggerService,
  );
}

describe('ManagedStripeCheckoutService', () => {
  it('fails clearly on the self-hosted API instead of dereferencing a disabled Stripe client', async () => {
    const service = new ManagedStripeCheckoutService(
      { get: vi.fn() } as unknown as ConfigService,
      {
        createManagedPaymentSession: vi.fn(),
      } as unknown as StripeService,
      {} as unknown as CacheService,
      { warn: vi.fn() } as unknown as LoggerService,
    );

    await expect(
      service.createCheckoutSession({
        email: 'local@example.com',
        quantity: 1,
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  describe('claimCheckoutResult', () => {
    it('hands the API key to the first reader only', async () => {
      const service = buildService(buildCache(provisioned));

      const first = await service.claimCheckoutResult('cs_123');
      const second = await service.claimCheckoutResult('cs_123');

      expect(first?.apiKey).toBe('gf_test_123');
      expect(second).toMatchObject({
        apiKey: null,
        apiKeyAlreadyExists: true,
        organizationId: 'org_1',
      });
    });

    it('counts claims per session', async () => {
      const service = buildService(buildCache(provisioned));

      await service.claimCheckoutResult('cs_a');

      expect((await service.claimCheckoutResult('cs_b'))?.apiKey).toBe(
        'gf_test_123',
      );
    });

    it('returns null when there is no result and never claims', async () => {
      const cache = buildCache(null);
      const service = buildService(cache);

      expect(await service.claimCheckoutResult('cs_missing')).toBeNull();
      expect(cache.incr).not.toHaveBeenCalled();
    });

    it('does not claim a result that carries no key', async () => {
      const cache = buildCache({ ...provisioned, apiKey: null });
      const service = buildService(cache);

      expect((await service.claimCheckoutResult('cs_123'))?.apiKey).toBeNull();
      expect(cache.incr).not.toHaveBeenCalled();
    });
  });
});
