import { ReferralsService } from '@api/collections/referrals/services/referrals.service';
import { StripePaymentWebhookHandler } from '@api/endpoints/webhooks/stripe/handlers/stripe-payment-webhook.handler';
import type { StripeWebhookSupportService } from '@api/endpoints/webhooks/stripe/handlers/stripe-webhook-support.service';
import type {
  StripeCharge,
  StripeDispute,
} from '@api/services/integrations/stripe/services/stripe.service';
import type { StripePaymentRevenueReferenceService } from '@api/services/integrations/stripe/services/stripe-payment-revenue-reference.service';
import { BillingRevenueSource } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('StripePaymentWebhookHandler', () => {
  const referrals = { applyPaymentReversal: vi.fn() };
  const logger = { warn: vi.fn() };
  const references = { resolve: vi.fn() };
  const support = { recordRevenueAdjustment: vi.fn() };
  const handler = new StripePaymentWebhookHandler(
    referrals as unknown as ReferralsService,
    logger as unknown as LoggerService,
    references as unknown as StripePaymentRevenueReferenceService,
    support as unknown as StripeWebhookSupportService,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    references.resolve.mockResolvedValue({
      grossAmountMinor: 10_000,
      revenueObjectId: 'cs_1',
    });
  });

  it('forwards the cumulative refunded amount for a charge', async () => {
    await handler.handleChargeRefunded({
      amount_refunded: 2_500,
      id: 'ch_1',
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

  it('subtracts a refund from the revenue the payment was recorded under', async () => {
    await handler.handleChargeRefunded({
      amount_refunded: 2_500,
      id: 'ch_1',
      payment_intent: 'pi_1',
    } as StripeCharge);

    expect(support.recordRevenueAdjustment).toHaveBeenCalledWith(
      expect.objectContaining({
        adjustedGrossMinor: 2_500,
        adjustmentId: 'refund:ch_1',
        originalGrossMinor: 10_000,
        originalStripeObjectId: 'cs_1',
        source: BillingRevenueSource.REFUND,
      }),
    );
  });

  it('subtracts a dispute from revenue', async () => {
    await handler.handleDisputeCreated({
      amount: 10_000,
      id: 'dp_1',
      payment_intent: 'pi_1',
    } as unknown as StripeDispute);

    expect(support.recordRevenueAdjustment).toHaveBeenCalledWith(
      expect.objectContaining({
        adjustmentId: 'dispute:dp_1',
        source: BillingRevenueSource.DISPUTE,
      }),
    );
  });

  it('leaves revenue alone when Stripe knows no checkout or invoice for the payment', async () => {
    references.resolve.mockResolvedValue(null);

    await handler.handleChargeRefunded({
      amount_refunded: 2_500,
      id: 'ch_1',
      payment_intent: 'pi_1',
    } as StripeCharge);

    expect(support.recordRevenueAdjustment).not.toHaveBeenCalled();
    expect(referrals.applyPaymentReversal).toHaveBeenCalled();
  });

  it('lets a Stripe lookup failure propagate so the event is redelivered', async () => {
    references.resolve.mockRejectedValue(new Error('stripe unavailable'));

    await expect(
      handler.handleChargeRefunded({
        amount_refunded: 2_500,
        id: 'ch_1',
        payment_intent: 'pi_1',
      } as StripeCharge),
    ).rejects.toThrow('stripe unavailable');
  });
});
