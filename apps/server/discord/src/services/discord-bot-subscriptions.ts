import { IntegrationPlatform } from '@genfeedai/contracts';
import {
  type DiscordSendToChannelEvent,
  type IntegrationEvent,
  REDIS_EVENTS,
} from '@genfeedai/integrations';
import type { RedisService } from '@libs/redis/redis.service';

interface SubscriptionLogger {
  error(...args: unknown[]): void;
  log(...args: unknown[]): void;
  warn(...args: unknown[]): void;
}

interface DiscordBotSubscriptionHandlers {
  handleIntegrationEvent(event: string, data: IntegrationEvent): Promise<void>;
  sendToChannel(
    orgId: string,
    channelId: string,
    message: string,
  ): Promise<unknown>;
}

function isDiscordSendToChannelEvent(
  data: unknown,
): data is DiscordSendToChannelEvent {
  return (
    typeof data === 'object' &&
    data !== null &&
    'orgId' in data &&
    'channelId' in data &&
    'message' in data &&
    typeof (data as DiscordSendToChannelEvent).orgId === 'string' &&
    typeof (data as DiscordSendToChannelEvent).channelId === 'string' &&
    typeof (data as DiscordSendToChannelEvent).message === 'string'
  );
}

function isIntegrationEvent(data: unknown): data is IntegrationEvent {
  return (
    typeof data === 'object' &&
    data !== null &&
    'integrationId' in data &&
    'platform' in data &&
    typeof (data as IntegrationEvent).integrationId === 'string' &&
    typeof (data as IntegrationEvent).platform === 'string'
  );
}

/**
 * Owns Discord's Redis subscription lifecycle without owning bot state.
 */
export class DiscordBotSubscriptions {
  private channelEventSubscribed = false;
  private redisSubscribed = false;
  private readonly integrationEvents = [
    REDIS_EVENTS.INTEGRATION_CREATED,
    REDIS_EVENTS.INTEGRATION_UPDATED,
    REDIS_EVENTS.INTEGRATION_DELETED,
  ] as const;

  constructor(
    private readonly redisService: RedisService,
    private readonly logger: SubscriptionLogger,
    private readonly handlers: DiscordBotSubscriptionHandlers,
  ) {}

  async subscribe(): Promise<void> {
    await this.subscribeToIntegrationEvents();
    await this.subscribeToChannelEvents();
  }

  async unsubscribe(): Promise<void> {
    if (!this.redisSubscribed) {
      return;
    }

    const results = await Promise.allSettled(
      this.integrationEvents.map((event) =>
        this.redisService.unsubscribe(event),
      ),
    );

    for (const result of results) {
      if (result.status === 'rejected') {
        this.logger.warn(
          'Failed to unsubscribe from one or more Redis channels',
          result.reason,
        );
      }
    }

    this.redisSubscribed = false;
  }

  private async subscribeToChannelEvents(): Promise<void> {
    if (this.channelEventSubscribed) {
      return;
    }

    await this.redisService.subscribe(
      REDIS_EVENTS.DISCORD_SEND_TO_CHANNEL,
      (data: unknown) => {
        if (!isDiscordSendToChannelEvent(data)) {
          return;
        }
        this.handlers
          .sendToChannel(data.orgId, data.channelId, data.message)
          .catch((error) =>
            this.logger.error(
              'Failed to handle discord:send-to-channel event',
              error,
            ),
          );
      },
    );

    this.channelEventSubscribed = true;
    this.logger.log('Subscribed to Discord send-to-channel Redis event');
  }

  private async subscribeToIntegrationEvents(): Promise<void> {
    if (this.redisSubscribed) {
      return;
    }

    for (const event of this.integrationEvents) {
      await this.redisService.subscribe(event, (data: unknown) => {
        if (
          !isIntegrationEvent(data) ||
          data.platform !== IntegrationPlatform.DISCORD
        ) {
          return;
        }
        this.handlers
          .handleIntegrationEvent(event, data)
          .catch((error) =>
            this.logger.error(
              'Failed to handle Redis integration event',
              error,
            ),
          );
      });
    }

    this.redisSubscribed = true;
    this.logger.log('Subscribed to Discord integration Redis events');
  }
}
