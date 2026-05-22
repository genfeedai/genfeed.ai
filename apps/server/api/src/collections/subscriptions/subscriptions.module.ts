/**
 * Subscriptions Module
 * Subscription plans: manage tiers, features, billing cycles,
and subscription status tracking.
 */

import { CreditsModule } from '@api/collections/credits/credits.module';
import { CustomersModule } from '@api/collections/customers/customers.module';
import { OrganizationsModule } from '@api/collections/organizations/organizations.module';
import { SubscriptionsController } from '@api/collections/subscriptions/controllers/subscriptions.controller';
import { SubscriptionsService } from '@api/collections/subscriptions/services/subscriptions.service';
import { UsersModule } from '@api/collections/users/users.module';
import { OssSubscriptionsService } from '@api/common/subscriptions/oss-subscriptions.service';
import { ClerkModule } from '@api/services/integrations/clerk/clerk.module';
import { StripeModule } from '@api/services/integrations/stripe/stripe.module';
import { isEEEnabled } from '@genfeedai/config';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [SubscriptionsController],
  exports: [SubscriptionsService],
  imports: [
    forwardRef(() => ClerkModule),
    forwardRef(() => CreditsModule),
    forwardRef(() => CustomersModule),
    forwardRef(() => OrganizationsModule),
    forwardRef(() => StripeModule),
    forwardRef(() => UsersModule),
  ],
  providers: [
    {
      provide: SubscriptionsService,
      useClass: isEEEnabled() ? SubscriptionsService : OssSubscriptionsService,
    },
  ],
})
export class SubscriptionsModule {}
