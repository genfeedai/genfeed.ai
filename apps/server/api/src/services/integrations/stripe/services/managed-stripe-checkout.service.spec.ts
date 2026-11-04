const deployment = vi.hoisted(() => ({ isSelfHosted: true }));

vi.mock('@genfeedai/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@genfeedai/config')>();

  return {
    ...actual,
    isSelfHostedDeployment: () => deployment.isSelfHosted,
  };
});

import { CacheService } from '@api/services/cache/cache.service';
import type { CreateManagedCheckoutDto } from '@api/services/integrations/stripe/dto/create-managed-checkout.dto';
import { ManagedStripeCheckoutService } from '@api/services/integrations/stripe/services/managed-stripe-checkout.service';
import { StripeService } from '@api/services/integrations/stripe/services/stripe.service';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';

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

const CLOUD_CONFIG: Record<string, string> = {
  GENFEEDAI_APP_URL: 'https://app.genfeed.ai',
  GENFEEDAI_PUBLIC_URL: 'https://genfeed.ai',
  STRIPE_PRICE_PAYG: 'price_payg',
};

type ManagedPaymentSessionParams = Parameters<
  StripeService['createManagedPaymentSession']
>[0];

/** Cloud service whose Stripe double records the session it was asked for. */
function buildCloudCheckout() {
  const sessions: ManagedPaymentSessionParams[] = [];
  const service = new ManagedStripeCheckoutService(
    { get: (key: string) => CLOUD_CONFIG[key] } as unknown as ConfigService,
    {
      createManagedPaymentSession: async (
        params: ManagedPaymentSessionParams,
      ) => {
        sessions.push(params);
        return { id: 'cs_cloud', url: 'https://checkout.stripe.com/c/cs' };
      },
    } as unknown as StripeService,
    {} as unknown as CacheService,
    { warn: vi.fn() } as unknown as LoggerService,
  );

  return { service, sessions };
}

describe('ManagedStripeCheckoutService', () => {
  describe('createCheckoutSession on Genfeed Cloud', () => {
    beforeEach(() => {
      deployment.isSelfHosted = false;
    });

    afterEach(() => {
      deployment.isSelfHosted = true;
    });

    it.each<[string, Partial<CreateManagedCheckoutDto>]>([
      ['no price', {}],
      ['the configured PAYG price', { stripePriceId: 'price_payg' }],
    ])('charges the configured PAYG price for %s', async (_label, input) => {
      const { service, sessions } = buildCloudCheckout();

      const result = await service.createCheckoutSession({
        email: 'buyer@example.com',
        ...input,
      });

      expect(result.url).toBe('https://checkout.stripe.com/c/cs');
      expect(sessions[0]?.stripePriceId).toBe('price_payg');
    });

    it('rejects a price outside the configured allowlist', async () => {
      const { service, sessions } = buildCloudCheckout();

      await expect(
        service.createCheckoutSession({
          email: 'buyer@example.com',
          stripePriceId: 'price_attacker_chosen',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(sessions).toEqual([]);
    });

    it('keeps redirect URLs on a configured Genfeed origin', async () => {
      const { service, sessions } = buildCloudCheckout();

      await service.createCheckoutSession({
        cancelUrl: 'https://genfeed.ai/pricing',
        email: 'buyer@example.com',
        successUrl:
          'https://app.genfeed.ai/managed-credits/success?session_id={CHECKOUT_SESSION_ID}',
      });

      expect(sessions[0]).toMatchObject({
        cancelUrl: 'https://genfeed.ai/pricing',
        successUrl:
          'https://app.genfeed.ai/managed-credits/success?session_id={CHECKOUT_SESSION_ID}',
      });
    });

    it.each([
      'http://localhost:3000/managed-credits/success?session_id={CHECKOUT_SESSION_ID}',
      'https://app.genfeed.localhost/managed-credits/success?session_id={CHECKOUT_SESSION_ID}',
    ])(
      'sends a self-hosted buyer back to their own machine at %s',
      async (successUrl) => {
        const { service, sessions } = buildCloudCheckout();

        await service.createCheckoutSession({
          email: 'buyer@example.com',
          successUrl,
        });

        expect(sessions[0]?.successUrl).toBe(successUrl);
      },
    );

    it('replaces foreign redirect URLs with the hosted success and credits pages', async () => {
      const { service, sessions } = buildCloudCheckout();

      await service.createCheckoutSession({
        cancelUrl: 'https://evil.example/cancel',
        email: 'buyer@example.com',
        successUrl:
          'https://evil.example/steal?session_id={CHECKOUT_SESSION_ID}',
      });

      expect(sessions[0]).toMatchObject({
        cancelUrl: 'https://app.genfeed.ai/settings/credits',
        successUrl:
          'https://app.genfeed.ai/managed-credits/success?session_id={CHECKOUT_SESSION_ID}',
      });
    });
  });

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
