import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { WorkflowNotificationDeliveryService } from '@server/services/notifications/workflow-notifications/workflow-notification-delivery.service';

@Injectable()
export class NotificationDeliveryRecoveryService {
  private readonly context = {
    service: NotificationDeliveryRecoveryService.name,
  };

  constructor(
    private readonly deliveryService: WorkflowNotificationDeliveryService,
    private readonly logger: LoggerService,
  ) {}

  async recover(): Promise<void> {
    try {
      const count = await this.deliveryService.recoverDueDeliveries();
      if (count > 0) {
        this.logger.log('Recovered durable notification deliveries', {
          ...this.context,
          count,
        });
      }
    } catch (error: unknown) {
      this.logger.error(
        'Notification delivery recovery failed',
        error,
        this.context,
      );
    }
  }
}
