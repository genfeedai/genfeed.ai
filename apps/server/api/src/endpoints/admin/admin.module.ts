import { AdminAnnouncementsModule } from '@api/endpoints/admin/announcements/announcements.module';
import { AdminFleetModule } from '@api/endpoints/admin/fleet/fleet.module';
import { AdminPlatformSettingsModule } from '@api/endpoints/admin/platform-settings/platform-settings.module';
import { AdminSystemEmailsModule } from '@api/endpoints/admin/system-emails/system-emails.module';
import { AdminWarmupAccountsModule } from '@api/endpoints/admin/warmup-accounts/warmup-accounts.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  imports: [
    forwardRef(() => AdminFleetModule),
    forwardRef(() => AdminAnnouncementsModule),
    forwardRef(() => AdminWarmupAccountsModule),
    forwardRef(() => AdminPlatformSettingsModule),
    forwardRef(() => AdminSystemEmailsModule),
  ],
})
export class AdminModule {}
