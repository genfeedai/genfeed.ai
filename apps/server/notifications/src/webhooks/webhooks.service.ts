import { EventsService } from '@libs/events/events.service';
import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import type { WebhookNotification } from '@notifications/shared/interfaces/webhooks.interface';

@Injectable()
export class WebhooksService {
  private readonly constructorName = WebhooksService.name;

  constructor(
    private readonly loggerService: LoggerService,
    private readonly eventsService: EventsService,
  ) {}

  async handleWebhookNotification(
    notification: WebhookNotification,
  ): Promise<void> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    try {
      this.loggerService.log(`${url} started`, {
        event: notification.event,
        metadata: notification.metadata,
        service: notification.service,
      });

      const eventData = {
        data: notification.data,
        event: notification.event,
        metadata: notification.metadata,
        service: notification.service,
        status: notification.status || 'received',
        timestamp: new Date().toISOString(),
        type: `webhook.${notification.service}.${notification.event}`,
      };

      await this.eventsService.emit('webhook.notification', eventData);

      if (notification.metadata?.userId) {
        await this.eventsService.emit(
          `user.${notification.metadata.userId}.webhook`,
          eventData,
        );
      }

      this.loggerService.log(`${url} completed`, {
        event: notification.event,
        service: notification.service,
      });
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      throw error;
    }
  }

  getWebhookStatus(
    service: string,
    id: string,
  ): {
    id: string;
    service: string;
    status: string;
    timestamp: string;
  } {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;
    this.loggerService.log(`${url} started`, { id, service });

    return {
      id,
      service,
      status: 'pending',
      timestamp: new Date().toISOString(),
    };
  }
}
