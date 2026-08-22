import { WorkflowNotificationDeliveryService } from '@api/services/notifications/workflow-notifications/workflow-notification-delivery.service';
import {
  NOTIFICATION_DELIVERY_QUEUE,
  type NotificationDeliveryJobData,
} from '@genfeedai/queue-contracts';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';

@Processor(NOTIFICATION_DELIVERY_QUEUE)
export class NotificationDeliveryProcessor extends WorkerHost {
  constructor(
    private readonly deliveryService: WorkflowNotificationDeliveryService,
  ) {
    super();
  }

  async process(job: Job<NotificationDeliveryJobData>): Promise<void> {
    await this.deliveryService.deliver(job.data.deliveryId);
  }
}
