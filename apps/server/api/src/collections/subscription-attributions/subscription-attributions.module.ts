/**
 * Subscription Attributions Module
 * Subscription attribution: track which content led to subscriptions,
Stripe integration, conversion analytics, and revenue attribution.
 */
import { SubscriptionAttributionsController } from '@api/collections/subscription-attributions/controllers/subscription-attributions.controller';
import { SubscriptionAttributionsService } from '@api/collections/subscription-attributions/services/subscription-attributions.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [SubscriptionAttributionsController],
  exports: [SubscriptionAttributionsService],
  imports: [],
  providers: [SubscriptionAttributionsService],
})
export class SubscriptionAttributionsModule {}
