import {
  NOTIFICATION_DELIVERY_QUEUE,
  type NotificationDeliveryJobData,
} from '@genfeedai/contracts/queue';
import { LoggerService } from '@libs/logger/logger.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';

@Injectable()
export class WorkflowNotificationQueueService {
  private readonly context = { service: WorkflowNotificationQueueService.name };

  constructor(
    @InjectQueue(NOTIFICATION_DELIVERY_QUEUE)
    private readonly queue: Queue<NotificationDeliveryJobData>,
    private readonly logger: LoggerService,
  ) {}

  async enqueue(deliveryId: string): Promise<void> {
    await this.queue.add(
      'deliver-notification',
      { deliveryId },
      {
        // One live job per durable row. Completed/failed jobs are removed so a
        // future database retry can reuse the same deterministic id.
        jobId: `notification-${deliveryId}`,
        removeOnComplete: true,
        removeOnFail: true,
      },
    );

    this.logger.debug('Durable notification delivery queued', {
      ...this.context,
      deliveryId,
    });
  }
}
