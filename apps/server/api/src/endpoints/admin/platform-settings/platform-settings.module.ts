import { PlatformSettingsModule } from '@api/collections/platform-settings/platform-settings.module';
import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { PlatformSettingsController } from '@api/endpoints/admin/platform-settings/platform-settings.controller';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [PlatformSettingsController],
  imports: [forwardRef(() => PlatformSettingsModule)],
  providers: [IpWhitelistGuard, SuperAdminGuard],
})
export class AdminPlatformSettingsModule {}
