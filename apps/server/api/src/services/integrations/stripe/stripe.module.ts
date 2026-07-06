import { CreditsModule } from '@api/collections/credits/credits.module';
import { MembersModule } from '@api/collections/members/members.module';
import { OrganizationsModule } from '@api/collections/organizations/organizations.module';
import { SubscriptionsModule } from '@api/collections/subscriptions/subscriptions.module';
import { UserSubscriptionsModule } from '@api/collections/user-subscriptions/user-subscriptions.module';
import { UsersModule } from '@api/collections/users/users.module';
import { ManagedStripeController } from '@api/services/integrations/stripe/controllers/managed-stripe.controller';
import { StripeController } from '@api/services/integrations/stripe/controllers/stripe.controller';
import { UserStripeController } from '@api/services/integrations/stripe/controllers/user-stripe.controller';
import { ManagedStripeCheckoutService } from '@api/services/integrations/stripe/services/managed-stripe-checkout.service';
import { StripeService } from '@api/services/integrations/stripe/services/stripe.service';
import { LifecycleEmailsModule } from '@api/services/lifecycle-emails/lifecycle-emails.module';
import { createServiceModule } from '@api/shared/service-module.factory';
import { forwardRef, Module } from '@nestjs/common';

const BaseModule = createServiceModule(StripeService, {
  additionalImports: [
    forwardRef(() => CreditsModule),
    forwardRef(() => MembersModule),
    forwardRef(() => OrganizationsModule),
    forwardRef(() => SubscriptionsModule),
    forwardRef(() => UserSubscriptionsModule),
    forwardRef(() => UsersModule),
    forwardRef(() => LifecycleEmailsModule),
  ],
});

@Module({
  controllers: [
    StripeController,
    UserStripeController,
    ManagedStripeController,
  ],
  exports: [...(BaseModule.exports ?? []), ManagedStripeCheckoutService],
  imports: BaseModule.imports ?? [],
  providers: [...(BaseModule.providers ?? []), ManagedStripeCheckoutService],
})
export class StripeModule {}
