import { randomUUID } from 'node:crypto';
import {
  CHANNEL_MESSAGE_TYPES,
  type IChannelDeliveryRequest,
} from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import {
  ChannelMessageDispatcherService,
  InvalidChannelMessageError,
} from '@notifications/services/channel-deliveries/channel-message-dispatcher.service';
import {
  isNotificationEvent,
  type NotificationEvent,
} from '@notifications/services/notification-handler.types';
import { ResendEmailDeliveryError } from '@notifications/services/resend/resend.service';

/**
 * Legacy Redis `notifications` subscriber. It renders through the same
 * dispatcher as the durable channel-delivery endpoint until the remaining
 * producers move onto the outbox (#5197).
 */
@Injectable()
export class NotificationHandlerService implements OnModuleInit {
  private readonly context = { service: NotificationHandlerService.name };

  constructor(
    private readonly logger: LoggerService,
    private readonly redisService: RedisService,
    private readonly dispatcher: ChannelMessageDispatcherService,
  ) {}

  async onModuleInit() {
    await this.redisService.subscribe('notifications', (message: unknown) => {
      if (!isNotificationEvent(message)) {
        this.logger.warn(
          'Received malformed notification event - skipping',
          this.context,
        );
        return;
      }
      this.handle(message).catch((error: unknown) =>
        this.logger.error(
          'Failed to process notification event',
          error,
          this.context,
        ),
      );
    });
    this.logger.log('Subscribed to all notification events', this.context);
  }

  private async handle(event: NotificationEvent): Promise<void> {
    const type = CHANNEL_MESSAGE_TYPES.find((entry) => entry === event.type);
    if (!type) {
      this.logger.warn(`Unknown event type: ${event.type}`, this.context);
      return;
    }
    const request: IChannelDeliveryRequest = {
      destination: null,
      idempotencyKey: `redis/${type}/${event.action}/${randomUUID()}`,
      message: { action: event.action, payload: event.payload, type },
    };
    try {
      await this.dispatcher.dispatch(request);
    } catch (error: unknown) {
      this.logger.error(
        `Failed to handle event ${event.type}:${event.action}`,
        error,
        this.context,
      );
      if (
        error instanceof InvalidChannelMessageError ||
        (error instanceof ResendEmailDeliveryError && !error.retryable)
      ) {
        return;
      }
      const retryCount = event.retryCount ?? 0;
      if (retryCount < 3) {
        setTimeout(() => {
          this.redisService
            .publish('notifications', { ...event, retryCount: retryCount + 1 })
            .catch((publishError: unknown) =>
              this.logger.error(
                'Failed to publish retry notification',
                publishError,
                this.context,
              ),
            );
        }, 5000 * Math.max(retryCount, 1));
      }
    }
  }
}
