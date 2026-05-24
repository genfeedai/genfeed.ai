vi.mock('@genfeedai/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@genfeedai/config')>();

  return {
    ...actual,
    IS_SELF_HOSTED: true,
  };
});

import { ConfigService } from '@api/config/config.service';
import { CacheService } from '@api/services/cache/services/cache.service';
import { ManagedStripeCheckoutService } from '@api/services/integrations/stripe/services/managed-stripe-checkout.service';
import { StripeService } from '@api/services/integrations/stripe/services/stripe.service';
import { LoggerService } from '@libs/logger/logger.service';
import { ServiceUnavailableException } from '@nestjs/common';

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
});
