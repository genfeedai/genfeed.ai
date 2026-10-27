import { StripeService } from '@api/services/integrations/stripe/services/stripe.service';
import type {
  IStripePaymentRevenueReference,
  IStripeProcessingFee,
} from '@genfeedai/contracts/interfaces/billing';
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

  /**
   * The Stripe processing fee on a payment, from the balance transaction of
   * its charge. Null while the charge has no balance transaction yet. Pass the
   * invoice id for a subscription payment and the payment intent otherwise.
   */
  async resolveProcessingFee(
    payment: { invoiceId: string } | { paymentIntentId: string },
  ): Promise<IStripeProcessingFee | null> {
    const url = `${StripePaymentRevenueReferenceService.name} ${CallerUtil.getCallerName()}`;
    const { stripe } = this.stripeService;

    try {
      const paymentIntentId =
        'paymentIntentId' in payment
          ? payment.paymentIntentId
          : await this.paymentIntentOfInvoice(payment.invoiceId);
      if (!paymentIntentId) {
        return null;
      }
      const paymentIntent = await stripe.paymentIntents.retrieve(
        paymentIntentId,
        { expand: ['latest_charge.balance_transaction'] },
      );
      const charge = paymentIntent.latest_charge;
      const balanceTransaction =
        charge && typeof charge === 'object'
          ? charge.balance_transaction
          : null;
      if (!balanceTransaction || typeof balanceTransaction !== 'object') {
        return null;
      }
      return {
        currency: balanceTransaction.currency,
        feeMinor: balanceTransaction.fee,
      };
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  private async paymentIntentOfInvoice(
    invoiceId: string,
  ): Promise<string | null> {
    const payments = await this.stripeService.stripe.invoicePayments.list({
      invoice: invoiceId,
      limit: 1,
    });
    const intent = payments.data[0]?.payment.payment_intent;
    return typeof intent === 'string' ? intent : (intent?.id ?? null);
  }
}
