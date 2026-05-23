/**
 * Subscription Attributions Module
 * Subscription attribution: track which content led to subscriptions,
Stripe integration, conversion analytics, and revenue attribution.
 */
import { Module } from '@nestjs/common';
import { SubscriptionAttributionsController } from './controllers/subscription-attributions.controller';
import { SubscriptionAttributionsService } from './services/subscription-attributions.service';

@Module({
  controllers: [SubscriptionAttributionsController],
  exports: [SubscriptionAttributionsService],
  imports: [],
  providers: [SubscriptionAttributionsService],
})
export class SubscriptionAttributionsModule {}
