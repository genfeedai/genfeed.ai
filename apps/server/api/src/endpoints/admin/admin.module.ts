import { AdminAnnouncementsModule } from '@api/endpoints/admin/announcements/announcements.module';
import { AdminPlatformSettingsModule } from '@api/endpoints/admin/platform-settings/platform-settings.module';
import { AdminSystemEmailsModule } from '@api/endpoints/admin/system-emails/system-emails.module';
import { AdminSystemNotificationsModule } from '@api/endpoints/admin/system-notifications/system-notifications.module';
import { AdminUnitEconomicsModule } from '@api/endpoints/admin/unit-economics/unit-economics.module';
import { AdminWarmupAccountsModule } from '@api/endpoints/admin/warmup-accounts/warmup-accounts.module';
import { Module } from '@nestjs/common';

@Module({
  imports: [
    AdminSystemNotificationsModule,
    AdminAnnouncementsModule,
    AdminWarmupAccountsModule,
    AdminPlatformSettingsModule,
    AdminSystemEmailsModule,
    AdminUnitEconomicsModule,
  ],
})
export class AdminModule {}
