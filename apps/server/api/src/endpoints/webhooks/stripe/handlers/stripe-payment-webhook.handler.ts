import { ReferralsService } from '@api/collections/referrals/services/referrals.service';
import { StripeWebhookSupportService } from '@api/endpoints/webhooks/stripe/handlers/stripe-webhook-support.service';
import type {
  StripeCharge,
  StripeDispute,
} from '@api/services/integrations/stripe/services/stripe.service';
import { StripePaymentRevenueReferenceService } from '@api/services/integrations/stripe/services/stripe-payment-revenue-reference.service';
import { BillingRevenueSource } from '@genfeedai/contracts';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

function resourceId(value: unknown): string | null {
  if (typeof value === 'string') {
    return value;
  }
  if (
    value &&
    typeof value === 'object' &&
    'id' in value &&
    typeof (value as { id?: unknown }).id === 'string'
  ) {
    return (value as { id: string }).id;
  }
  return null;
}

@Injectable()
export class StripePaymentWebhookHandler {
  constructor(
    private readonly referralsService: ReferralsService,
    private readonly logger: LoggerService,
    private readonly paymentReferences: StripePaymentRevenueReferenceService,
    private readonly supportService: StripeWebhookSupportService,
  ) {}

  async handleChargeRefunded(charge: StripeCharge): Promise<void> {
    const paymentIntentId = resourceId(charge.payment_intent);
    if (!paymentIntentId) {
      return;
    }
    await this.subtractFromRevenue({
      adjustedGrossMinor: charge.amount_refunded,
      adjustmentId: `refund:${charge.id}`,
      paymentIntentId,
      source: BillingRevenueSource.REFUND,
    });
    await this.referralsService.applyPaymentReversal({
      disputed: false,
      refundedAmountCents: charge.amount_refunded,
      stripePaymentIntentId: paymentIntentId,
    });
  }

  async handleDisputeCreated(dispute: StripeDispute): Promise<void> {
    const paymentIntentId = resourceId(
      (dispute as unknown as { payment_intent?: unknown }).payment_intent,
    );
    if (!paymentIntentId) {
      this.logger.warn(
        'Stripe dispute missing payment intent; no referral reward matched',
        {
          disputeId: dispute.id,
        },
      );
      return;
    }
    await this.subtractFromRevenue({
      adjustedGrossMinor: dispute.amount,
      adjustmentId: `dispute:${dispute.id}`,
      paymentIntentId,
      source: BillingRevenueSource.DISPUTE,
    });
    await this.referralsService.applyPaymentReversal({
      disputed: true,
      refundedAmountCents: dispute.amount,
      stripePaymentIntentId: paymentIntentId,
    });
  }

  /**
   * Books the refund or dispute against the revenue the payment was recorded
   * under. Looking the payment up can fail on a Stripe outage; that error
   * propagates so Stripe redelivers the event, which is safe because every
   * ledger row is keyed by the adjustment and its cumulative amount.
   */
  private async subtractFromRevenue(input: {
    adjustedGrossMinor: number;
    adjustmentId: string;
    paymentIntentId: string;
    source: BillingRevenueSource.REFUND | BillingRevenueSource.DISPUTE;
  }): Promise<void> {
    if (!(input.adjustedGrossMinor > 0)) {
      return;
    }
    const reference = await this.paymentReferences.resolve(
      input.paymentIntentId,
    );
    if (!reference) {
      this.logger.warn(
        'Stripe payment is not in the revenue ledger; nothing to subtract',
        { adjustmentId: input.adjustmentId },
      );
      return;
    }
    await this.supportService.recordRevenueAdjustment({
      adjustedGrossMinor: input.adjustedGrossMinor,
      adjustmentId: input.adjustmentId,
      occurredAt: new Date(),
      originalGrossMinor: reference.grossAmountMinor,
      originalStripeObjectId: reference.revenueObjectId,
      source: input.source,
    });
  }
}
