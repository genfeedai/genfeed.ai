import { ActivitiesModule } from '@api/collections/activities/activities.module';
import { ApiKeysModule } from '@api/collections/api-keys/api-keys.module';
import { BrandsModule } from '@api/collections/brands/brands.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { CustomersModule } from '@api/collections/customers/customers.module';
import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { OrganizationsModule } from '@api/collections/organizations/organizations.module';
import { ReferralsModule } from '@api/collections/referrals/referrals.module';
import { SubscriptionAttributionsModule } from '@api/collections/subscription-attributions/subscription-attributions.module';
import { SubscriptionsModule } from '@api/collections/subscriptions/subscriptions.module';
import { UserSubscriptionsModule } from '@api/collections/user-subscriptions/user-subscriptions.module';
import { UserSetupModule } from '@api/collections/users/user-setup.module';
import { UsersModule } from '@api/collections/users/users.module';
import { CommonModule } from '@api/common/common.module';
import { SubscriptionCreditGrantModule } from '@api/common/subscriptions/subscription-credit-grant.module';
import { StripeAttributionTrackerService } from '@api/endpoints/webhooks/stripe/handlers/stripe-attribution-tracker.service';
import { StripeCheckoutWebhookHandler } from '@api/endpoints/webhooks/stripe/handlers/stripe-checkout-webhook.handler';
import { StripeCustomerWebhookHandler } from '@api/endpoints/webhooks/stripe/handlers/stripe-customer-webhook.handler';
import { StripeInvoiceWebhookHandler } from '@api/endpoints/webhooks/stripe/handlers/stripe-invoice-webhook.handler';
import { StripePaymentWebhookHandler } from '@api/endpoints/webhooks/stripe/handlers/stripe-payment-webhook.handler';
import { StripeSubscriptionCreditReconcilerService } from '@api/endpoints/webhooks/stripe/handlers/stripe-subscription-credit-reconciler.service';
import { StripeSubscriptionWebhookHandler } from '@api/endpoints/webhooks/stripe/handlers/stripe-subscription-webhook.handler';
import { StripeWebhookSupportService } from '@api/endpoints/webhooks/stripe/handlers/stripe-webhook-support.service';
import { StripeWebhookController } from '@api/endpoints/webhooks/stripe/webhooks.stripe.controller';
import { StripeWebhookService } from '@api/endpoints/webhooks/stripe/webhooks.stripe.service';
import { StripeModule } from '@api/services/integrations/stripe/stripe.module';
import { LifecycleEmailsModule } from '@api/services/lifecycle-emails/lifecycle-emails.module';
import { createServiceModule } from '@api/shared/service-module.factory';
import { ConfigModule } from '@libs/config/config.module';
import { ConfigService } from '@libs/config/config.service';
import { RedisModule } from '@libs/redis/redis.module';
import { Module, type Provider } from '@nestjs/common';

const BaseModule = createServiceModule(StripeWebhookService, {
  additionalImports: [
    ActivitiesModule,
    ApiKeysModule,
    BrandsModule,
    CommonModule,
    CreditsModule,
    CustomersModule,
    LifecycleEmailsModule,
    OrganizationSettingsModule,
    OrganizationsModule,
    ReferralsModule,
    StripeModule,
    SubscriptionAttributionsModule,
    SubscriptionCreditGrantModule,
    SubscriptionsModule,
    UserSubscriptionsModule,
    UserSetupModule,
    UsersModule,
    RedisModule.forRoot({
      configModule: ConfigModule,
      configService: ConfigService,
    }),
  ],
  additionalProviders: [
    StripeAttributionTrackerService,
    StripeCheckoutWebhookHandler,
    StripeCustomerWebhookHandler,
    StripeInvoiceWebhookHandler,
    StripePaymentWebhookHandler,
    StripeSubscriptionCreditReconcilerService,
    StripeSubscriptionWebhookHandler,
    StripeWebhookSupportService,
  ],
});

@Module({
  controllers: [StripeWebhookController],
  exports: BaseModule.exports ?? [],
  imports: BaseModule.imports ?? [],
  providers: (BaseModule.providers ?? []) as Provider[],
})
export class StripeWebhooksModule {}
