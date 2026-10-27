import { StripeService } from '@api/services/integrations/stripe/services/stripe.service';
import type { IStripePaymentRevenueReference } from '@genfeedai/contracts/interfaces/billing';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';

/**
 * Maps a Stripe payment back to the revenue-ledger row it was recorded under,
 * so a refund or dispute can take its share out of the same organization's
 * revenue.
 */
@Injectable()
export class StripePaymentRevenueReferenceService {
  constructor(
    private readonly stripeService: StripeService,
    private readonly loggerService: LoggerService,
  ) {}

  /**
   * Finds the invoice or checkout session a payment settled. Null when Stripe
   * knows of neither (a one-off charge made outside Checkout or Billing).
   */
  async resolve(
    paymentIntentId: string,
  ): Promise<IStripePaymentRevenueReference | null> {
    const url = `${StripePaymentRevenueReferenceService.name} ${CallerUtil.getCallerName()}`;
    const { stripe } = this.stripeService;

    try {
      const paymentIntent =
        await stripe.paymentIntents.retrieve(paymentIntentId);
      const grossAmountMinor =
        paymentIntent.amount_received || paymentIntent.amount;

      const invoicePayments = await stripe.invoicePayments.list({
        limit: 1,
        payment: { payment_intent: paymentIntentId, type: 'payment_intent' },
      });
      const invoice = invoicePayments.data[0]?.invoice;
      const invoiceId = typeof invoice === 'string' ? invoice : invoice?.id;
      if (invoiceId) {
        return { grossAmountMinor, revenueObjectId: invoiceId };
      }

      const sessions = await stripe.checkout.sessions.list({
        limit: 1,
        payment_intent: paymentIntentId,
      });
      const sessionId = sessions.data[0]?.id;
      return sessionId
        ? { grossAmountMinor, revenueObjectId: sessionId }
        : null;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }
}
