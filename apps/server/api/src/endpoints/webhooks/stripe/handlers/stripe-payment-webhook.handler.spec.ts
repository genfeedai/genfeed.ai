import { ReferralsService } from '@api/collections/referrals/services/referrals.service';
import { StripePaymentWebhookHandler } from '@api/endpoints/webhooks/stripe/handlers/stripe-payment-webhook.handler';
import { LoggerService } from '@libs/logger/logger.service';
import type {
  StripeCharge,
  StripeDispute,
} from '@server/services/integrations/stripe/services/stripe.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('StripePaymentWebhookHandler', () => {
  const referrals = { applyPaymentReversal: vi.fn() };
  const logger = { warn: vi.fn() };
  const handler = new StripePaymentWebhookHandler(
    referrals as unknown as ReferralsService,
    logger as unknown as LoggerService,
  );

  beforeEach(() => vi.clearAllMocks());

  it('forwards the cumulative refunded amount for a charge', async () => {
    await handler.handleChargeRefunded({
      amount_refunded: 2_500,
      payment_intent: 'pi_1',
    } as StripeCharge);

    expect(referrals.applyPaymentReversal).toHaveBeenCalledWith({
      disputed: false,
      refundedAmountCents: 2_500,
      stripePaymentIntentId: 'pi_1',
    });
  });

  it('fully reverses a disputed payment', async () => {
    await handler.handleDisputeCreated({
      amount: 10_000,
      id: 'dp_1',
      payment_intent: { id: 'pi_1' },
    } as unknown as StripeDispute);

    expect(referrals.applyPaymentReversal).toHaveBeenCalledWith({
      disputed: true,
      refundedAmountCents: 10_000,
      stripePaymentIntentId: 'pi_1',
    });
  });
});
