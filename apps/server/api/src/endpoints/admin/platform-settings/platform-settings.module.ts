import { PlatformSettingsModule } from '@api/collections/platform-settings/platform-settings.module';
import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { PlatformSettingsController } from '@api/endpoints/admin/platform-settings/platform-settings.controller';
import { NotificationsModule } from '@api/services/notifications/notifications.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [PlatformSettingsController],
  imports: [NotificationsModule, PlatformSettingsModule],
  providers: [IpWhitelistGuard, SuperAdminGuard],
})
export class AdminPlatformSettingsModule {}
