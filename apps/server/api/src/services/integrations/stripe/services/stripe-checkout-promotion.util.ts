import { PRO_LAUNCH_PROMOTION_CODE } from '@genfeedai/pricing';
import type { LoggerService } from '@libs/logger/logger.service';
import type StripeConstructor from 'stripe';

/**
 * Opens Checkout promo entry, except on the launch price (Pro), where the
 * launch code is applied for the customer so Checkout opens at the price the
 * pricing page shows. Stripe rejects sessions that set both `discounts` and
 * `allow_promotion_codes`, so the launch price gives up the entry box; every
 * other price keeps it, and customer-restricted team codes (GENFEED100) are
 * still entered there. If the launch code is missing, inactive or restricted
 * to a customer, or the lookup fails, the launch price falls back to the entry
 * box rather than failing the checkout.
 */
export async function applyCheckoutPromotion(
  stripe: InstanceType<typeof StripeConstructor>,
  loggerService: Pick<LoggerService, 'warn'>,
  sessionConfig: StripeConstructor.Checkout.SessionCreateParams,
  isLaunchPrice: boolean,
): Promise<void> {
  if (isLaunchPrice) {
    try {
      const promotionCodes = await stripe.promotionCodes.list({
        active: true,
        code: PRO_LAUNCH_PROMOTION_CODE,
        limit: 10,
      });
      // A code restricted to one customer cannot be applied for anyone else.
      const redeemable = promotionCodes.data.find(
        (promotionCode) => !promotionCode.customer,
      );

      if (redeemable) {
        sessionConfig.discounts = [{ promotion_code: redeemable.id }];
        delete sessionConfig.allow_promotion_codes;
        return;
      }
    } catch (error: unknown) {
      loggerService.warn('Launch promotion code lookup failed', {
        code: PRO_LAUNCH_PROMOTION_CODE,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  sessionConfig.allow_promotion_codes = true;
  delete sessionConfig.discounts;
}
