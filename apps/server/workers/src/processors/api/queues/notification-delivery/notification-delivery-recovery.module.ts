import { NotificationsModule } from '@api/services/notifications/notifications.module';
import { Module } from '@nestjs/common';
import { NotificationDeliveryRecoveryService } from '@workers/processors/api/queues/notification-delivery/notification-delivery-recovery.service';

@Module({
  exports: [NotificationDeliveryRecoveryService],
  imports: [NotificationsModule],
  providers: [NotificationDeliveryRecoveryService],
})
export class NotificationDeliveryRecoveryModule {}
