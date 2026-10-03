import { AdminAnnouncementsModule } from '@api/endpoints/admin/announcements/announcements.module';
import { AdminCreditHoldsModule } from '@api/endpoints/admin/credit-holds/credit-holds.module';
import { AdminFeaturedWorkflowsModule } from '@api/endpoints/admin/featured-workflows/featured-workflows.module';
import { AdminModelPricingModule } from '@api/endpoints/admin/model-pricing/model-pricing.module';
import { AdminPlatformSettingsModule } from '@api/endpoints/admin/platform-settings/platform-settings.module';
import { AdminSystemEmailsModule } from '@api/endpoints/admin/system-emails/system-emails.module';
import { AdminSystemNotificationsModule } from '@api/endpoints/admin/system-notifications/system-notifications.module';
import { AdminUnitEconomicsModule } from '@api/endpoints/admin/unit-economics/unit-economics.module';
import { AdminWarmupAccountsModule } from '@api/endpoints/admin/warmup-accounts/warmup-accounts.module';
import { Module } from '@nestjs/common';

@Module({
  imports: [
    AdminCreditHoldsModule,
    AdminModelPricingModule,
    AdminSystemNotificationsModule,
    AdminAnnouncementsModule,
    AdminWarmupAccountsModule,
    AdminPlatformSettingsModule,
    AdminFeaturedWorkflowsModule,
    AdminSystemEmailsModule,
    AdminUnitEconomicsModule,
  ],
})
export class AdminModule {}
