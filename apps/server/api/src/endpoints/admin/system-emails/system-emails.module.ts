import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { SystemEmailsController } from '@api/endpoints/admin/system-emails/system-emails.controller';
import { AdminSystemEmailsService } from '@api/endpoints/admin/system-emails/system-emails.service';
import { NotificationsModule } from '@api/services/notifications/notifications.module';
import { Module } from '@nestjs/common';

@Module({
  imports: [NotificationsModule],
  controllers: [SystemEmailsController],
  providers: [AdminSystemEmailsService, IpWhitelistGuard, SuperAdminGuard],
})
export class AdminSystemEmailsModule {}
