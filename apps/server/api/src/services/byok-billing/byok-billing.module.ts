import { CreditsModule } from '@api/collections/credits/credits.module';
import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { SubscriptionsModule } from '@api/collections/subscriptions/subscriptions.module';
import { ConfigModule } from '@api/config/config.module';
import { ByokBillingService } from '@api/services/byok-billing/byok-billing.service';
import { StripeModule } from '@api/services/integrations/stripe/stripe.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  exports: [ByokBillingService],
  imports: [
    ConfigModule,
    forwardRef(() => CreditsModule),
    forwardRef(() => OrganizationSettingsModule),
    forwardRef(() => StripeModule),
    forwardRef(() => SubscriptionsModule),
  ],
  providers: [ByokBillingService],
})
export class ByokBillingModule {}
