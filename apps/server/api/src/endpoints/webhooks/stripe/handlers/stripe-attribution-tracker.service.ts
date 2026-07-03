import { UsersService } from '@api/collections/users/services/users.service';
import {
  extractAttributionMetadata,
  normalizeObjectId,
} from '@api/endpoints/webhooks/stripe/stripe-webhook.util';
import {
  type StripeCheckoutSession,
  type StripeCustomer,
  StripeService,
} from '@api/services/integrations/stripe/services/stripe.service';
import {
  type ISubscriptionAttributionsService,
  type ISubscriptionOssReadModel,
  SUBSCRIPTION_ATTRIBUTIONS_SERVICE,
} from '@genfeedai/interfaces/billing';
import { LoggerService } from '@libs/logger/logger.service';
import { Inject, Injectable } from '@nestjs/common';

/** Records subscription attribution (UTM/source metadata) from checkout sessions. */
@Injectable()
export class StripeAttributionTrackerService {
  private readonly constructorName: string = String(this.constructor.name);

  constructor(
    private readonly loggerService: LoggerService,

    private readonly stripeService: StripeService,
    private readonly usersService: UsersService,
    @Inject(SUBSCRIPTION_ATTRIBUTIONS_SERVICE)
    private readonly subscriptionAttributionsService: ISubscriptionAttributionsService,
  ) {}

  async trackSubscriptionAttributionFromSession(
    session: StripeCheckoutSession,
    subscription: ISubscriptionOssReadModel,
    url: string,
  ): Promise<void> {
    if (!session.subscription || !session.customer) {
      return;
    }

    try {
      const stripeSubscription = await this.stripeService.getSubscription(
        session.subscription as string,
      );

      const primaryItem = stripeSubscription.items.data[0];
      const organizationId = normalizeObjectId(subscription.organization);
      const userId = normalizeObjectId(subscription.user);

      const user = await this.usersService.findOne({
        _id: subscription.user,
      });

      const metadata = extractAttributionMetadata(
        session.metadata,
        (key, reason) => {
          this.loggerService.warn(
            `${this.constructorName} failed to parse attribution metadata`,
            { key, reason },
          );
        },
      );

      const email =
        session.customer_details?.email ||
        (typeof stripeSubscription.customer === 'object' &&
        stripeSubscription.customer &&
        'email' in stripeSubscription.customer
          ? (stripeSubscription.customer as StripeCustomer).email || undefined
          : undefined) ||
        user?.email ||
        'unknown';

      await this.subscriptionAttributionsService.trackSubscription(
        {
          amount:
            primaryItem?.price?.unit_amount ??
            (primaryItem as unknown as { plan?: { amount?: number } })?.plan
              ?.amount ??
            0,
          currency: primaryItem?.price?.currency?.toUpperCase(),
          email,
          plan:
            (primaryItem?.price?.id as string | undefined) ||
            subscription.stripePriceId ||
            'unknown',
          sessionId: metadata.sessionId ?? session.id,
          sourceContentId: metadata.sourceContentId,
          sourceContentType: metadata.sourceContentType,
          sourceLinkId: metadata.sourceLinkId,
          sourcePlatform: metadata.sourcePlatform,
          stripeCustomerId: session.customer as string,
          stripeSubscriptionId: session.subscription as string,
          userId,
          utm: metadata.utm,
        },
        organizationId,
      );

      this.loggerService.log(`${url} subscription attribution recorded`, {
        contentId: metadata.sourceContentId,
        organizationId,
        stripeSubscriptionId: session.subscription,
      });
    } catch (error: unknown) {
      this.loggerService.error(
        `${url} failed to record subscription attribution`,
        error,
      );
    }
  }
}
