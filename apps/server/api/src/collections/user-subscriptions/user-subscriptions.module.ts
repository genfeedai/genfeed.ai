/**
 * User Subscriptions Module
 * User-level subscription management for consumer apps (getshareable.app).
 * Tracks individual user Stripe subscriptions independent of organization subscriptions.
 */
import { UserSubscriptionsService } from '@api/collections/user-subscriptions/services/user-subscriptions.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [],
  exports: [UserSubscriptionsService],
  imports: [],
  providers: [UserSubscriptionsService],
})
export class UserSubscriptionsModule {}
