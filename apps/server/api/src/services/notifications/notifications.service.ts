import type {
  IChatbotMetadata,
  IDiscordEmbed,
  IEmailDeliveryErrorResponse,
  IEmailDeliveryRequest,
  IEmailDeliveryResponse,
  IIngredientNotificationData,
  IModelDiscoveryNotificationPayload,
  INotificationEvent,
  ITelegramMessageOptions,
  IUserCreatedPayload,
} from '@genfeedai/contracts/interfaces';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import {
  buildIoRedisClientOptions,
  parseRedisConnection,
} from '@libs/redis/redis-connection.utils';
import { safeFetch } from '@libs/security/destination-guard';
import {
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import Redis from 'ioredis';

export type { INotificationEvent as NotificationEvent };

export class EmailDeliveryError extends Error {
  constructor(
    readonly retryable: boolean,
    readonly statusCode?: number,
    cause?: unknown,
  ) {
    super(`Email delivery failed (status ${statusCode ?? 'unknown'})`, {
      cause,
    });
    this.name = EmailDeliveryError.name;
  }
}

function isRetryableEmailDeliveryStatus(
  statusCode: number | undefined,
): boolean {
  return (
    statusCode === undefined ||
    statusCode === 401 ||
    statusCode === 403 ||
    statusCode === 404 ||
    statusCode === 408 ||
    statusCode === 425 ||
    statusCode === 429 ||
    statusCode >= 500
  );
}

@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  private publisher: Redis;
  private isShuttingDown = false;
  private readonly constructorName = this.constructor.name;
  private static readonly CONNECT_TIMEOUT_MS = 5_000;
  private static readonly EMAIL_DELIVERY_TIMEOUT_MS = 10_000;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {
    const config = parseRedisConnection(this.configService);
    this.publisher = new Redis(
      buildIoRedisClientOptions(config, {
        connectTimeout: NotificationsService.CONNECT_TIMEOUT_MS,
        retryStrategy: () => null,
      }),
    );

    this.publisher.on('error', (error: Error) => {
      this.logger.error(`${this.constructorName} Redis publisher error`, error);
    });

    this.publisher.on('connect', () => {
      this.logger.log(`${this.constructorName} Redis publisher connected`);
    });
  }

  async onModuleInit() {
    try {
      await this.connectPublisher('initial connect');
      this.logger.log(`${this.constructorName} initialized successfully`);
    } catch (error: unknown) {
      this.logger.warn(
        `${this.constructorName} failed to connect - notifications disabled`,
        error,
      );
    }
  }

  async onModuleDestroy() {
    try {
      this.isShuttingDown = true;
      // Remove all event listeners to prevent memory leaks
      this.publisher.removeAllListeners();
      if (this.publisher.status !== 'end') {
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

    if (this.publisher.status === 'ready') {
      return true;
    }

    if (this.publisher.status !== 'end') {
      return false;
    }

    try {
      await this.connectPublisher('reconnect');
      // Widen: TS narrows `status` to 'end' through the guard above and cannot
      // see that connectPublisher mutates it.
      const statusAfterReconnect: string = this.publisher.status;
      return statusAfterReconnect === 'ready';
    } catch (error: unknown) {
      this.logger.error(`${this.constructorName} failed to reconnect`, error);
      return false;
    }
  }

  private isClosedClientError(error: unknown): boolean {
    return (
      error instanceof Error &&
      error.message.toLowerCase().includes('connection is closed')
    );
  }

  private async connectPublisher(reason: string): Promise<void> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    try {
      await Promise.race([
        this.publisher.connect(),
        new Promise<never>((_resolve, reject) => {
          timeoutId = setTimeout(
            () =>
              reject(
                new Error(
                  `${this.constructorName} Redis publisher ${reason} timed out after ${NotificationsService.CONNECT_TIMEOUT_MS}ms`,
                ),
              ),
            NotificationsService.CONNECT_TIMEOUT_MS,
          );
        }),
      ]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
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

  /** Request-time provider acceptance for durable and authentication email. */
  async deliverEmail(payload: IEmailDeliveryRequest): Promise<string> {
    let explicitRetryability: boolean | undefined;
    let statusCode: number | undefined;

    try {
      const notificationsUrl = this.configService
        .get('GENFEEDAI_MICROSERVICES_NOTIFICATIONS_URL')
        ?.trim();
      const internalApiKey = this.configService
        .get('GENFEEDAI_API_KEY')
        ?.trim();

      if (!notificationsUrl || !internalApiKey) {
        throw new Error('Synchronous notifications delivery is not configured');
      }

      const baseUrl = new URL(
        notificationsUrl.endsWith('/')
          ? notificationsUrl
          : `${notificationsUrl}/`,
      );
      if (baseUrl.protocol !== 'http:' && baseUrl.protocol !== 'https:') {
        throw new Error('Notifications service URL must use HTTP or HTTPS');
      }

      const deliveryUrl = new URL('v1/internal/email-deliveries', baseUrl);
      const response = await safeFetch(
        deliveryUrl,
        {
          body: JSON.stringify(payload),
          headers: {
            Authorization: `Bearer ${internalApiKey}`,
            'Content-Type': 'application/json',
          },
          method: 'POST',
          signal: AbortSignal.timeout(
            NotificationsService.EMAIL_DELIVERY_TIMEOUT_MS,
          ),
        },
        {
          allowedOrigins: [baseUrl.origin],
          allowPrivateNetwork: true,
        },
      );

      statusCode = response.status;
      if (!response.ok) {
        const errorResponse =
          await this.readEmailDeliveryErrorResponse(response);
        explicitRetryability = errorResponse?.retryable;
        throw new Error(
          `Notifications service returned HTTP ${response.status}`,
        );
      }

      const responseBody: unknown = await response.json();
      if (!this.isEmailDeliveryResponse(responseBody)) {
        throw new Error(
          'Notifications service returned an invalid delivery response',
        );
      }

      return responseBody.emailId;
    } catch (error: unknown) {
      this.logger.error(
        `${this.constructorName} synchronous email delivery failed`,
        error,
        statusCode === undefined ? undefined : { statusCode },
      );
      throw new EmailDeliveryError(
        explicitRetryability ?? isRetryableEmailDeliveryStatus(statusCode),
        statusCode,
        error,
      );
    }
  }

  private async readEmailDeliveryErrorResponse(
    response: Response,
  ): Promise<IEmailDeliveryErrorResponse | null> {
    try {
      const value: unknown = await response.json();
      if (typeof value !== 'object' || value === null) {
        return null;
      }

      const message = Reflect.get(value, 'message');
      const retryable = Reflect.get(value, 'retryable');
      if (typeof message !== 'string' || typeof retryable !== 'boolean') {
        return null;
      }

      return { message, retryable };
    } catch {
      return null;
    }
  }

  private isEmailDeliveryResponse(
    value: unknown,
  ): value is IEmailDeliveryResponse {
    if (typeof value !== 'object' || value === null) {
      return false;
    }

    const emailId = Reflect.get(value, 'emailId');
    return typeof emailId === 'string' && emailId.trim().length > 0;
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

  sendReviewGatePendingEmail(input: {
    to: string;
    workflowId: string;
    workflowLabel: string;
    executionId: string;
    nodeId: string;
    reviewUrl?: string;
    captionPreview?: string;
    organizationId?: string;
    userId?: string;
  }): Promise<void> {
    return this.sendNotification({
      action: 'review_gate_pending',
      organizationId: input.organizationId,
      payload: input,
      type: 'email',
      userId: input.userId,
    });
  }

  sendReviewGatePendingSlack(chatId: string, message: string): Promise<void> {
    return this.sendNotification({
      action: 'send_message',
      payload: { chatId, message },
      type: 'slack',
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

  sendUserCreatedNotification(user: IUserCreatedPayload): Promise<void> {
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
