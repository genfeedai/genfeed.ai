import { applyCheckoutPromotion } from '@api/services/integrations/stripe/services/stripe-checkout-promotion.util';
import type StripeConstructor from 'stripe';
import { describe, expect, it, vi } from 'vitest';

type CheckoutParams = StripeConstructor.Checkout.SessionCreateParams;

function stripeWithCodes(
  data: Array<{ customer: string | null; id: string }>,
): InstanceType<typeof StripeConstructor> {
  return {
    promotionCodes: { list: vi.fn().mockResolvedValue({ data }) },
  } as unknown as InstanceType<typeof StripeConstructor>;
}

function createLogger() {
  return { error: vi.fn(), warn: vi.fn() };
}

describe('applyCheckoutPromotion launch code', () => {
  it('applies a redeemable launch code and drops the entry box', async () => {
    const config: CheckoutParams = { allow_promotion_codes: true };

    await applyCheckoutPromotion(
      stripeWithCodes([{ customer: null, id: 'promo_open' }]),
      createLogger(),
      config,
      true,
    );

    expect(config.discounts).toEqual([{ promotion_code: 'promo_open' }]);
    expect(config.allow_promotion_codes).toBeUndefined();
  });

  it('logs an error and opens the entry box when the launch code is missing', async () => {
    const config: CheckoutParams = {};
    const logger = createLogger();

    await applyCheckoutPromotion(stripeWithCodes([]), logger, config, true);

    expect(config.allow_promotion_codes).toBe(true);
    expect(config.discounts).toBeUndefined();
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('logs an error when the only launch code is restricted to a customer', async () => {
    const config: CheckoutParams = {};
    const logger = createLogger();

    await applyCheckoutPromotion(
      stripeWithCodes([{ customer: 'cus_other', id: 'promo_private' }]),
      logger,
      config,
      true,
    );

    expect(config.allow_promotion_codes).toBe(true);
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it('does not look the code up or log an error for other prices', async () => {
    const config: CheckoutParams = {};
    const logger = createLogger();
    const stripe = stripeWithCodes([]);

    await applyCheckoutPromotion(stripe, logger, config, false);

    expect(config.allow_promotion_codes).toBe(true);
    expect(logger.error).not.toHaveBeenCalled();
    expect(stripe.promotionCodes.list).not.toHaveBeenCalled();
  });
});
