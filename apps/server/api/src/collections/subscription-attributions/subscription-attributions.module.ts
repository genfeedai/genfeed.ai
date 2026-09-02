/**
 * Subscription Attributions Module
 * Subscription attribution: track which content led to subscriptions, Stripe
 * integration, conversion analytics, and revenue attribution.
 *
 * Routes and the shared `SUBSCRIPTION_ATTRIBUTIONS_SERVICE` binding follow the
 * runtime gate in `@api/common/subscriptions/billing.providers`.
 */
import { SubscriptionAttributionsController } from '@api/collections/subscription-attributions/controllers/subscription-attributions.controller';
import { SubscriptionAttributionsService } from '@api/collections/subscription-attributions/services/subscription-attributions.service';
import {
  billingControllers,
  subscriptionAttributionsServiceProvider,
} from '@api/common/subscriptions/billing.providers';
import { SUBSCRIPTION_ATTRIBUTIONS_SERVICE } from '@genfeedai/contracts/interfaces/billing';
import { Module } from '@nestjs/common';

@Module({
  controllers: billingControllers([SubscriptionAttributionsController]),
  exports: [SubscriptionAttributionsService, SUBSCRIPTION_ATTRIBUTIONS_SERVICE],
  imports: [],
  providers: [
    SubscriptionAttributionsService,
    subscriptionAttributionsServiceProvider(),
  ],
})
export class SubscriptionAttributionsModule {}
