import { ConfigService } from '@api/config/config.service';
import type {
  IChatbotMetadata,
  IDiscordEmbed,
  IIngredientNotificationData,
  IModelDiscoveryNotificationPayload,
  INotificationEvent,
  ITelegramMessageOptions,
} from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import {
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';

export type { INotificationEvent as NotificationEvent };

@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  private publisher: RedisClientType;
  private isShuttingDown = false;
  private readonly constructorName = this.constructor.name;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {
    const redisUrl =
      this.configService.get('REDIS_URL') || 'redis://localhost:6379';
    this.publisher = createClient({
      socket: {
        connectTimeout: 10000,
      },
      url: redisUrl,
    });

    this.publisher.on('error', (error: Error) => {
      this.logger.error(`${this.constructorName} Redis publisher error`, error);
    });

    this.publisher.on('connect', () => {
      this.logger.log(`${this.constructorName} Redis publisher connected`);
    });
  }

  async onModuleInit() {
    try {
      await this.publisher.connect();
      this.logger.log(`${this.constructorName} initialized successfully`);
    } catch (error: unknown) {
      this.logger.error(`${this.constructorName} failed to connect`, error);
    }
  }

  async onModuleDestroy() {
    try {
      this.isShuttingDown = true;
      // Remove all event listeners to prevent memory leaks
      this.publisher.removeAllListeners();
      if (this.publisher.isOpen) {
        await this.publisher.quit();
      }
      this.logger.log(`${this.constructorName} Redis publisher disconnected`);
    } catch (error: unknown) {
      this.logger.error(`${this.constructorName} failed to disconnect`, error);
    }
  }

  async sendNotification(event: INotificationEvent): Promise<void> {
    if (!(await this.ensurePublisherReady())) {
      this.logger.warn(
        `${this.constructorName} skipped notification publish because Redis publisher is unavailable`,
        {
          action: event.action,
          service: this.constructorName,
          type: event.type,
        },
      );
      return;
    }

    try {
      event.timestamp = new Date();
      const payload = JSON.stringify(event);
      await this.publisher.publish('notifications', payload);

      this.logger.debug(
        `Published notification: ${event.type}:${event.action}`,
      );
    } catch (error: unknown) {
      if (this.isClosedClientError(error)) {
        this.logger.warn(
          `${this.constructorName} skipped notification publish — Redis client closed`,
          {
            action: event.action,
            isShuttingDown: this.isShuttingDown,
            service: this.constructorName,
            type: event.type,
          },
        );
        return;
      }

      this.logger.error('Failed to send notification', error);
      throw error;
    }
  }

  private async ensurePublisherReady(): Promise<boolean> {
    if (this.isShuttingDown) {
      return false;
    }

    if (this.publisher.isReady) {
      return true;
    }

    if (this.publisher.isOpen) {
      return false;
    }

    try {
      await this.publisher.connect();
      return this.publisher.isReady;
    } catch (error: unknown) {
      this.logger.error(`${this.constructorName} failed to reconnect`, error);
      return false;
    }
  }

  private isClosedClientError(error: unknown): boolean {
    return (
      error instanceof Error &&
      error.message.toLowerCase().includes('client is closed')
    );
  }

  // Helper methods for specific notification types
  sendTelegramMessage(
    chatId: string,
    message: string,
    options?: ITelegramMessageOptions,
  ): Promise<void> {
    return this.sendNotification({
      action: 'send_message',
      payload: {
        chatId,
        message,
        options,
      },
      type: 'telegram',
    });
  }

  sendEmail(
    to: string,
    subject: string,
    html: string,
    from?: string,
  ): Promise<void> {
    return this.sendNotification({
      action: 'send_email',
      payload: {
        from,
        html,
        subject,
        to,
      },
      type: 'email',
    });
  }

  sendCrmLeadOutreachEmail(input: {
    to: string;
    leadId: string;
    leadName: string;
    company?: string;
    subject?: string;
    organizationId?: string;
  }): Promise<void> {
    return this.sendNotification({
      action: 'crm_lead_outreach',
      organizationId: input.organizationId,
      payload: input,
      type: 'email',
    });
  }

  sendWorkflowStatusEmail(input: {
    to: string;
    workflowId: string;
    workflowLabel: string;
    status: 'completed' | 'failed';
    error?: string;
    organizationId?: string;
    userId?: string;
  }): Promise<void> {
    return this.sendNotification({
      action: 'workflow_status_email',
      organizationId: input.organizationId,
      payload: input,
      type: 'email',
      userId: input.userId,
    });
  }

  sendVideoStatusEmail(input: {
    to: string;
    status: 'completed' | 'failed';
    path: string;
    jobId?: string;
    error?: string;
    organizationId?: string;
    url?: string;
    userId?: string;
  }): Promise<void> {
    return this.sendNotification({
      action: 'video_status_email',
      organizationId: input.organizationId,
      payload: input,
      type: 'email',
      userId: input.userId,
    });
  }

  sendDiscordCard(card: IDiscordEmbed): Promise<void> {
    return this.sendNotification({
      action: 'send_card',
      payload: {
        card,
      },
      type: 'discord',
    });
  }

  sendChatbotMessage(
    sessionId: string,
    message: string,
    metadata?: IChatbotMetadata,
  ): Promise<void> {
    return this.sendNotification({
      action: 'send_message',
      payload: {
        message,
        metadata,
        sessionId,
      },
      type: 'bot',
    });
  }

  sendPostNotification(post: {
    platform: string;
    externalId: string;
    description?: string;
    mediaUrl?: string;
    platforms?: Array<{ platform: string; url: string }>;
  }): Promise<void> {
    return this.sendNotification({
      action: 'post_notification',
      payload: post,
      type: 'discord',
    });
  }

  sendArticleNotification(article: {
    label: string;
    slug: string;
    summary?: string;
    category?: string;
    publicUrl?: string;
  }): Promise<void> {
    return this.sendNotification({
      action: 'article_notification',
      payload: article,
      type: 'discord',
    });
  }

  sendVercelNotification(data: { embed: IDiscordEmbed }): Promise<void> {
    return this.sendNotification({
      action: 'vercel_notification',
      payload: data,
      type: 'discord',
    });
  }

  sendChromaticNotification(data: { embed: IDiscordEmbed }): Promise<void> {
    return this.sendNotification({
      action: 'chromatic_notification',
      payload: data,
      type: 'discord',
    });
  }

  sendUserCreatedNotification(user: {
    _id: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    avatar?: string;
    isInvited?: boolean;
  }): Promise<void> {
    return this.sendNotification({
      action: 'user_notification',
      payload: user,
      type: 'discord',
    });
  }

  sendModelDiscoveryNotification(
    model: IModelDiscoveryNotificationPayload,
  ): Promise<void> {
    return this.sendNotification({
      action: 'model_discovery',
      payload: model,
      type: 'discord',
    });
  }

  sendIngredientNotification(
    category: string,
    cdnUrl: string,
    ingredient: IIngredientNotificationData,
  ): Promise<void> {
    return this.sendNotification({
      action: 'ingredient_notification',
      payload: {
        category,
        cdnUrl,
        ingredient,
      },
      type: 'discord',
    });
  }

  async sendLowCreditsAlert(
    organizationId: string,
    balance: number,
  ): Promise<void> {
    const payload = { balance, organizationId };

    await Promise.all([
      this.sendNotification({
        action: 'low_credits_alert',
        payload,
        type: 'discord',
      }),
      this.sendNotification({
        action: 'low_credits_alert',
        payload,
        type: 'email',
      }),
    ]);
  }
}
