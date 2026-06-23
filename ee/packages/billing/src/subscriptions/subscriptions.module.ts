/**
 * Subscriptions Module
 * Subscription plans: manage tiers, features, billing cycles,
and subscription status tracking.
 */

import { CreditsModule } from '@api/collections/credits/credits.module';
import { CustomersModule } from '@api/collections/customers/customers.module';
import { OrganizationsModule } from '@api/collections/organizations/organizations.module';
import { OssSubscriptionsService } from '@api/common/subscriptions/oss-subscriptions.service';
import { StripeModule } from '@api/services/integrations/stripe/stripe.module';
import { isEEEnabled } from '@genfeedai/config';
import { forwardRef, Module } from '@nestjs/common';
import { SubscriptionsController } from './controllers/subscriptions.controller';
import { SubscriptionsService } from './services/subscriptions.service';

@Module({
  controllers: [SubscriptionsController],
  exports: [SubscriptionsService],
  imports: [
    forwardRef(() => CreditsModule),
    forwardRef(() => CustomersModule),
    forwardRef(() => OrganizationsModule),
    forwardRef(() => StripeModule),
  ],
  providers: [
    {
      provide: SubscriptionsService,
      useClass: isEEEnabled() ? SubscriptionsService : OssSubscriptionsService,
    },
  ],
})
export class SubscriptionsModule {}
