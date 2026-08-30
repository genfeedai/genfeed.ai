import { ReferralsService } from '@api/collections/referrals/services/referrals.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import type {
  StripeCharge,
  StripeDispute,
} from '@server/services/integrations/stripe/services/stripe.service';

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
  ) {}

  async handleChargeRefunded(charge: StripeCharge): Promise<void> {
    const paymentIntentId = resourceId(charge.payment_intent);
    if (!paymentIntentId) {
      return;
    }
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
    await this.referralsService.applyPaymentReversal({
      disputed: true,
      refundedAmountCents: dispute.amount,
      stripePaymentIntentId: paymentIntentId,
    });
  }
}
