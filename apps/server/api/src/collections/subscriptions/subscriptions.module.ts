/**
 * Subscriptions Module
 * Organization (Stripe) subscription plans: manage tiers, features, billing
 * cycles, and subscription status tracking.
 *
 * SaaS and community images ship this same module. Whether the routes exist
 * and whether the shared `SUBSCRIPTIONS_SERVICE` token resolves to the real
 * Stripe-backed service or the community stub is decided at boot by the
 * runtime gate in `@api/common/subscriptions/billing.providers`.
 */
import { CreditsModule } from '@api/collections/credits/credits.module';
import { CustomersModule } from '@api/collections/customers/customers.module';
import { OrganizationsModule } from '@api/collections/organizations/organizations.module';
import { SubscriptionsController } from '@api/collections/subscriptions/controllers/subscriptions.controller';
import { SubscriptionsService } from '@api/collections/subscriptions/services/subscriptions.service';
import {
  billingControllers,
  subscriptionsServiceProvider,
} from '@api/common/subscriptions/billing.providers';
import { StripeModule } from '@api/services/integrations/stripe/stripe.module';
import { SUBSCRIPTIONS_SERVICE } from '@genfeedai/interfaces/billing';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: billingControllers([SubscriptionsController]),
  exports: [SubscriptionsService, SUBSCRIPTIONS_SERVICE],
  imports: [
    forwardRef(() => CreditsModule),
    forwardRef(() => CustomersModule),
    forwardRef(() => OrganizationsModule),
    forwardRef(() => StripeModule),
  ],
  providers: [SubscriptionsService, subscriptionsServiceProvider()],
})
export class SubscriptionsModule {}
