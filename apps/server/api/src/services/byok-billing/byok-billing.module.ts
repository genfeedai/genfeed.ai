import { OrganizationSettingsModule } from '@api/collections/organization-settings/organization-settings.module';
import { SubscriptionsModule } from '@api/collections/subscriptions/subscriptions.module';
import { ByokBillingService } from '@api/services/byok-billing/byok-billing.service';
import { StripeModule } from '@api/services/integrations/stripe/stripe.module';
import { ConfigModule } from '@libs/config/config.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  exports: [ByokBillingService],
  imports: [
    forwardRef(() => ConfigModule),
    forwardRef(() => OrganizationSettingsModule),
    forwardRef(() => StripeModule),
    forwardRef(() => SubscriptionsModule),
  ],
  providers: [ByokBillingService],
})
export class ByokBillingModule {}
