import { AdminAnnouncementsModule } from '@api/endpoints/admin/announcements/announcements.module';
import { AdminFleetModule } from '@api/endpoints/admin/fleet/fleet.module';
import { AdminPlatformSettingsModule } from '@api/endpoints/admin/platform-settings/platform-settings.module';
import { AdminSystemEmailsModule } from '@api/endpoints/admin/system-emails/system-emails.module';
import { AdminWarmupAccountsModule } from '@api/endpoints/admin/warmup-accounts/warmup-accounts.module';
import { Module } from '@nestjs/common';

@Module({
  imports: [
    AdminFleetModule,
    AdminAnnouncementsModule,
    AdminWarmupAccountsModule,
    AdminPlatformSettingsModule,
    AdminSystemEmailsModule,
  ],
})
export class AdminModule {}
