import type { ReferralsService } from '@api/collections/referrals/services/referrals.service';
import { StripePaymentWebhookHandler } from '@api/endpoints/webhooks/stripe/handlers/stripe-payment-webhook.handler';
import type { StripeWebhookSupportService } from '@api/endpoints/webhooks/stripe/handlers/stripe-webhook-support.service';
import type {
  StripeCharge,
  StripeDispute,
} from '@api/services/integrations/stripe/services/stripe.service';
import type { StripePaymentRevenueReferenceService } from '@api/services/integrations/stripe/services/stripe-payment-revenue-reference.service';
import { BillingRevenueSource } from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it } from 'vitest';

describe('StripePaymentWebhookHandler', () => {
  // Stripe knows checkout cs_1 for payment intent pi_1.
  let paymentReferences: Map<
    string,
    { grossAmountMinor: number; revenueObjectId: string }
  >;
  let isStripeDown: boolean;
  let reversals: unknown[];
  let adjustments: Array<Record<string, unknown>>;
  let warnings: string[];
  let handler: StripePaymentWebhookHandler;

  beforeEach(() => {
    paymentReferences = new Map([
      ['pi_1', { grossAmountMinor: 10_000, revenueObjectId: 'cs_1' }],
    ]);
    isStripeDown = false;
    reversals = [];
    adjustments = [];
    warnings = [];

    handler = new StripePaymentWebhookHandler(
      {
        applyPaymentReversal: async (input: unknown) => {
          reversals.push(input);
        },
      } as unknown as ReferralsService,
      {
        warn: (message: string) => {
          warnings.push(message);
        },
      } as unknown as LoggerService,
      {
        resolve: async (paymentIntentId: string) => {
          if (isStripeDown) {
            throw new Error('stripe unavailable');
          }
          return paymentReferences.get(paymentIntentId) ?? null;
        },
      } as unknown as StripePaymentRevenueReferenceService,
      {
        recordRevenueAdjustment: async (input: Record<string, unknown>) => {
          adjustments.push(input);
        },
      } as unknown as StripeWebhookSupportService,
    );
  });

  const refund = {
    amount_refunded: 2_500,
    id: 'ch_1',
    payment_intent: 'pi_1',
  } as StripeCharge;

  it('subtracts a refund from revenue and reverses the referral by the cumulative amount', async () => {
    await handler.handleChargeRefunded(refund);

    expect(adjustments).toEqual([
      {
        adjustedGrossMinor: 2_500,
        adjustmentId: 'refund:ch_1',
        occurredAt: expect.any(Date),
        originalGrossMinor: 10_000,
        originalStripeObjectId: 'cs_1',
        source: BillingRevenueSource.REFUND,
      },
    ]);
    expect(reversals).toEqual([
      {
        disputed: false,
        refundedAmountCents: 2_500,
        stripePaymentIntentId: 'pi_1',
      },
    ]);
  });

  it.each([
    ['an expanded payment intent', { id: 'pi_1' }],
    ['a payment intent id', 'pi_1'],
  ])('fully reverses a dispute on %s', async (_label, paymentIntent) => {
    await handler.handleDisputeCreated({
      amount: 10_000,
      id: 'dp_1',
      payment_intent: paymentIntent,
    } as unknown as StripeDispute);

    expect(adjustments).toEqual([
      expect.objectContaining({
        adjustedGrossMinor: 10_000,
        adjustmentId: 'dispute:dp_1',
        source: BillingRevenueSource.DISPUTE,
      }),
    ]);
    expect(reversals).toEqual([
      {
        disputed: true,
        refundedAmountCents: 10_000,
        stripePaymentIntentId: 'pi_1',
      },
    ]);
  });

  it('leaves revenue alone when Stripe knows no checkout or invoice for the payment', async () => {
    paymentReferences.clear();

    await handler.handleChargeRefunded(refund);

    expect(adjustments).toEqual([]);
    expect(reversals).toHaveLength(1);
    expect(warnings).toEqual([
      'Stripe payment is not in the revenue ledger; nothing to subtract',
    ]);
  });

  it('ignores a dispute without a payment intent', async () => {
    await handler.handleDisputeCreated({
      amount: 10_000,
      id: 'dp_1',
    } as unknown as StripeDispute);

    expect(adjustments).toEqual([]);
    expect(reversals).toEqual([]);
    expect(warnings).toEqual([
      'Stripe dispute missing payment intent; no referral reward matched',
    ]);
  });

  it('lets a Stripe lookup failure propagate so the event is redelivered', async () => {
    isStripeDown = true;

    await expect(handler.handleChargeRefunded(refund)).rejects.toThrow(
      'stripe unavailable',
    );
    expect(reversals).toEqual([]);
  });
});
