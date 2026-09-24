import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { AdminSystemNotificationsController } from '@api/endpoints/admin/system-notifications/system-notifications.controller';
import { SystemEventsModule } from '@api/services/system-events/system-events.module';
import { Module } from '@nestjs/common';
@Module({
  imports: [SystemEventsModule],
  controllers: [AdminSystemNotificationsController],
  providers: [IpWhitelistGuard, SuperAdminGuard],
})
export class AdminSystemNotificationsModule {}
