import { CreditsModule } from '@api/collections/credits/credits.module';
import { CustomersModule } from '@api/collections/customers/customers.module';
import { MembersModule } from '@api/collections/members/members.module';
import { OrganizationsCoreModule } from '@api/collections/organizations/organizations-core.module';
import { SubscriptionsModule } from '@api/collections/subscriptions/subscriptions.module';
import { UserSubscriptionsModule } from '@api/collections/user-subscriptions/user-subscriptions.module';
import { UsersModule } from '@api/collections/users/users.module';
import { ManagedStripeController } from '@api/services/integrations/stripe/controllers/managed-stripe.controller';
import { StripeController } from '@api/services/integrations/stripe/controllers/stripe.controller';
import { UserStripeController } from '@api/services/integrations/stripe/controllers/user-stripe.controller';
import { ManagedStripeCheckoutService } from '@api/services/integrations/stripe/services/managed-stripe-checkout.service';
import { StripeCoreModule } from '@api/services/integrations/stripe/stripe-core.module';
import { LifecycleEmailsModule } from '@api/services/lifecycle-emails/lifecycle-emails.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [
    StripeController,
    UserStripeController,
    ManagedStripeController,
  ],
  exports: [StripeCoreModule, ManagedStripeCheckoutService],
  imports: [
    StripeCoreModule,
    CreditsModule,
    CustomersModule,
    MembersModule,
    OrganizationsCoreModule,
    SubscriptionsModule,
    UserSubscriptionsModule,
    UsersModule,
    LifecycleEmailsModule,
  ],
  providers: [ManagedStripeCheckoutService],
})
export class StripeModule {}
