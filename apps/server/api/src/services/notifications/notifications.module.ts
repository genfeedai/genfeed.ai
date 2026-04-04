import { ConfigModule } from '@api/config/config.module';
import { NotificationsService } from '@api/services/notifications/notifications.service';
import { Module } from '@nestjs/common';

@Module({
  exports: [NotificationsService],
  imports: [ConfigModule],
  providers: [NotificationsService],
})
export class NotificationsModule {}
