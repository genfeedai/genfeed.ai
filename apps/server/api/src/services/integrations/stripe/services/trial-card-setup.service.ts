import {
  type StripeCheckoutSession,
  StripeService,
} from '@api/services/integrations/stripe/services/stripe.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';

/**
 * Saves a card without charging it so the free-trial credits can be released
 * against that card.
 */
@Injectable()
export class TrialCardSetupService {
  constructor(
    private readonly stripeService: StripeService,
    private readonly loggerService: LoggerService,
  ) {}

  /**
   * Checkout in setup mode: saves a card to the customer without charging it.
   * The trial credits are claimed against the card it returns.
   */
  async createTrialCardSetupSession(params: {
    cancelUrl: string;
    organizationId: string;
    stripeCustomerId: string;
    successUrl: string;
  }): Promise<StripeCheckoutSession> {
    const url = `${TrialCardSetupService.name} ${CallerUtil.getCallerName()}`;
    const { cancelUrl, organizationId, stripeCustomerId, successUrl } = params;

    try {
      const session = await this.stripeService.stripe.checkout.sessions.create({
        cancel_url: cancelUrl,
        allowed_payment_method_types: ['card'],
        customer: stripeCustomerId,
        metadata: { organizationId, purpose: 'trial-card' },
        mode: 'setup',
        success_url: successUrl,
      });

      this.loggerService.log(`${url} success`, {
        organizationId,
        sessionId: session.id,
        stripeCustomerId,
      });

      return session;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  /**
   * The Stripe fingerprint of the card a completed setup session saved, or
   * null when the session is not a finished trial-card setup for this
   * customer. Fingerprints are stable per physical card across customers.
   */
  async getTrialCardFingerprint(
    sessionId: string,
    stripeCustomerId: string,
  ): Promise<string | null> {
    const url = `${TrialCardSetupService.name} ${CallerUtil.getCallerName()}`;

    try {
      const session =
        await this.stripeService.stripe.checkout.sessions.retrieve(sessionId, {
          expand: ['setup_intent.payment_method'],
        });
      const customerId =
        typeof session.customer === 'string'
          ? session.customer
          : session.customer?.id;
      const setupIntent = session.setup_intent;
      if (
        session.mode !== 'setup' ||
        session.status !== 'complete' ||
        session.metadata?.purpose !== 'trial-card' ||
        customerId !== stripeCustomerId ||
        !setupIntent ||
        typeof setupIntent === 'string' ||
        setupIntent.status !== 'succeeded'
      ) {
        return null;
      }
      const paymentMethod = setupIntent.payment_method;
      if (!paymentMethod || typeof paymentMethod === 'string') {
        return null;
      }
      return paymentMethod.card?.fingerprint ?? null;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }
}
