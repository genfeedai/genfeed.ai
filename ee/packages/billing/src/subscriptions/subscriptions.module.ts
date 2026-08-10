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
import { hasOrganizationBilling } from '@genfeedai/config';
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
      // SaaS cloud or licensed EE — not license-key-only (Cloud has no key).
      // Production EE builds always use the real service; community never loads
      // this module (webpack aliases OSS stubs instead).
      provide: SubscriptionsService,
      useClass:
        process.env.NODE_ENV === 'production' || hasOrganizationBilling()
          ? SubscriptionsService
          : OssSubscriptionsService,
    },
  ],
})
export class SubscriptionsModule {}
