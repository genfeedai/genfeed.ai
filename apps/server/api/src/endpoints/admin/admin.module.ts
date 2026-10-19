import { AdminAnnouncementsModule } from '@api/endpoints/admin/announcements/announcements.module';
import { AdminCreditHoldsModule } from '@api/endpoints/admin/credit-holds/credit-holds.module';
import { AdminEconomicsModule } from '@api/endpoints/admin/economics/economics.module';
import { AdminFeaturedWorkflowsModule } from '@api/endpoints/admin/featured-workflows/featured-workflows.module';
import { AdminModelPricingModule } from '@api/endpoints/admin/model-pricing/model-pricing.module';
import { AdminOrganizationAppsReportModule } from '@api/endpoints/admin/organization-apps-report/organization-apps-report.module';
import { AdminPlatformSettingsModule } from '@api/endpoints/admin/platform-settings/platform-settings.module';
import { AdminSeedsModule } from '@api/endpoints/admin/seeds/seeds.module';
import { AdminSystemBrandModule } from '@api/endpoints/admin/system-brand/system-brand.module';
import { AdminSystemEmailsModule } from '@api/endpoints/admin/system-emails/system-emails.module';
import { AdminSystemNotificationsModule } from '@api/endpoints/admin/system-notifications/system-notifications.module';
import { AdminUnitEconomicsModule } from '@api/endpoints/admin/unit-economics/unit-economics.module';
import { AdminWarmupAccountsModule } from '@api/endpoints/admin/warmup-accounts/warmup-accounts.module';
import { Module } from '@nestjs/common';

@Module({
  imports: [
    AdminCreditHoldsModule,
    AdminEconomicsModule,
    AdminModelPricingModule,
    AdminSystemNotificationsModule,
    AdminAnnouncementsModule,
    AdminWarmupAccountsModule,
    AdminPlatformSettingsModule,
    AdminFeaturedWorkflowsModule,
    AdminSystemEmailsModule,
    AdminSeedsModule,
    AdminSystemBrandModule,
    AdminOrganizationAppsReportModule,
    AdminUnitEconomicsModule,
  ],
})
export class AdminModule {}
