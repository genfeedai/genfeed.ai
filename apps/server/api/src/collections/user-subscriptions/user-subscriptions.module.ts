/**
 * User Subscriptions Module
 * User-level subscription management for consumer apps. Tracks individual user
 * Stripe subscriptions independent of organization subscriptions.
 *
 * The shared `USER_SUBSCRIPTIONS_SERVICE` token resolves to the real service
 * or the community stub via the runtime gate in
 * `@api/common/subscriptions/billing.providers`.
 */
import { UserSubscriptionsService } from '@api/collections/user-subscriptions/services/user-subscriptions.service';
import { userSubscriptionsServiceProvider } from '@api/common/subscriptions/billing.providers';
import { USER_SUBSCRIPTIONS_SERVICE } from '@genfeedai/contracts/interfaces/billing';
import { Module } from '@nestjs/common';

@Module({
  controllers: [],
  exports: [UserSubscriptionsService, USER_SUBSCRIPTIONS_SERVICE],
  imports: [],
  providers: [UserSubscriptionsService, userSubscriptionsServiceProvider()],
})
export class UserSubscriptionsModule {}
