import { NotificationsService } from '@api/services/notifications/notifications.service';
import { ConfigModule } from '@libs/config/config.module';
import { Module } from '@nestjs/common';

@Module({
  exports: [NotificationsService],
  imports: [ConfigModule],
  providers: [NotificationsService],
})
export class NotificationsModule {}
