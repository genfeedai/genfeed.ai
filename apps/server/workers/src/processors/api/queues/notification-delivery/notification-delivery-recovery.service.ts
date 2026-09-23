import { WorkflowNotificationDeliveryService } from '@api/services/notifications/workflow-notifications/workflow-notification-delivery.service';
import { SystemEventsService } from '@api/services/system-events/system-events.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class NotificationDeliveryRecoveryService {
  private readonly context = {
    service: NotificationDeliveryRecoveryService.name,
  };

  constructor(
    private readonly deliveryService: WorkflowNotificationDeliveryService,
    private readonly logger: LoggerService,
    private readonly systemEvents: SystemEventsService,
  ) {}

  async recover(): Promise<void> {
    await this.systemEvents.recover().catch(() => {
      this.logger.warn(
        'System event recovery failed; next schedule will retry',
      );
    });
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
