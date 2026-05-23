/**
 * User Subscriptions Module
 * User-level subscription management for consumer apps (getshareable.app).
 * Tracks individual user Stripe subscriptions independent of organization subscriptions.
 */
import { Module } from '@nestjs/common';
import { UserSubscriptionsService } from './services/user-subscriptions.service';

@Module({
  controllers: [],
  exports: [UserSubscriptionsService],
  imports: [],
  providers: [UserSubscriptionsService],
})
export class UserSubscriptionsModule {}
