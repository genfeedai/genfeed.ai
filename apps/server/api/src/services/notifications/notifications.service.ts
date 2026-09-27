import type {
  IChannelDeliveryRequest,
  IChannelDeliveryResponse,
  IEmailDeliveryErrorResponse,
  IEmailDeliveryRequest,
  IEmailDeliveryResponse,
} from '@genfeedai/contracts/interfaces';
import { ConfigService } from '@libs/config/config.service';
import type { SystemEvent } from '@libs/interfaces/system-event.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { safeFetch } from '@libs/security/destination-guard';
import { Injectable } from '@nestjs/common';

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

/** A channel message the notifications service did not accept. */
export class ChannelDeliveryError extends Error {
  constructor(
    readonly retryable: boolean,
    readonly statusCode?: number,
    cause?: unknown,
  ) {
    super(`Channel delivery failed (status ${statusCode ?? 'unknown'})`, {
      cause,
    });
    this.name = ChannelDeliveryError.name;
  }
}

function readChannelDeliveryResponse(
  value: unknown,
): IChannelDeliveryResponse | null {
  if (typeof value !== 'object' || value === null) return null;
  const status = Reflect.get(value, 'status');
  const messageId = Reflect.get(value, 'messageId');
  const reason = Reflect.get(value, 'reason');
  if (status === 'delivered' && typeof messageId === 'string' && messageId) {
    return { messageId, status };
  }
  if (status === 'skipped' && typeof reason === 'string' && reason) {
    return { reason: reason.slice(0, 200), status };
  }
  return null;
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

/**
 * Synchronous client for the notifications service's internal endpoints.
 * Every notification is recorded through the activity recording API (#5197);
 * the durable delivery worker calls these methods to hand a claimed delivery
 * to its provider and waits for the acknowledgement.
 */
@Injectable()
export class NotificationsService {
  private readonly constructorName = this.constructor.name;
  private static readonly EMAIL_DELIVERY_TIMEOUT_MS = 10_000;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {}

  /** Request-time provider acceptance for durable and authentication email. */
  async systemNotificationStatus(): Promise<{
    webhookConfigured: boolean;
    transportConfigured: boolean;
  }> {
    const result = await this.requestSystemNotifications();
    if (
      !result ||
      typeof result !== 'object' ||
      !('webhookConfigured' in result) ||
      typeof result.webhookConfigured !== 'boolean'
    )
      throw new Error('Invalid notifications status');
    return {
      webhookConfigured: result.webhookConfigured,
      transportConfigured: true,
    };
  }

  async deliverSystemNotification(event: SystemEvent): Promise<void> {
    const result = await this.requestSystemNotifications(event);
    if (
      !result ||
      typeof result !== 'object' ||
      !('delivered' in result) ||
      result.delivered !== true
    )
      throw new Error('Notification delivery was not acknowledged');
  }

  private async requestSystemNotifications(
    event?: SystemEvent,
  ): Promise<unknown> {
    const endpoint = this.configService
      .get('GENFEEDAI_MICROSERVICES_NOTIFICATIONS_URL')
      ?.trim();
    const key = this.configService.get('GENFEEDAI_API_KEY')?.trim();
    if (!endpoint || !key)
      throw new Error('Notifications service is not configured');
    try {
      const base = new URL(endpoint.endsWith('/') ? endpoint : `${endpoint}/`);
      if (!['http:', 'https:'].includes(base.protocol))
        throw new Error('Invalid service URL');
      const response = await safeFetch(
        new URL('v1/internal/system-notifications', base),
        {
          method: event ? 'POST' : 'GET',
          headers: {
            Authorization: `Bearer ${key}`,
            'Content-Type': 'application/json',
          },
          ...(event ? { body: JSON.stringify(event) } : {}),
          signal: AbortSignal.timeout(15_000),
        },
        {
          allowedOrigins: [base.origin],
          allowPrivateNetwork: true,
          maxRedirects: 0,
        },
      );
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error('Notifications service rejected delivery');
      }
      return await response.json();
    } catch {
      throw new Error('Notifications service request failed');
    }
  }

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
        new Error('Synchronous email provider request failed'),
        statusCode === undefined ? undefined : { statusCode },
      );
      throw new EmailDeliveryError(
        explicitRetryability ?? isRetryableEmailDeliveryStatus(statusCode),
        statusCode,
        error,
      );
    }
  }

  /**
   * Send one rendered channel message (Discord, Telegram, Slack or an
   * explicit email) through the notifications service and wait for its
   * acknowledgement. Called only by the durable delivery worker.
   */
  async deliverChannelMessage(
    request: IChannelDeliveryRequest,
  ): Promise<IChannelDeliveryResponse> {
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
        throw new Error('Channel delivery is not configured');
      }
      const baseUrl = new URL(
        notificationsUrl.endsWith('/')
          ? notificationsUrl
          : `${notificationsUrl}/`,
      );
      if (baseUrl.protocol !== 'http:' && baseUrl.protocol !== 'https:') {
        throw new Error('Notifications service URL must use HTTP or HTTPS');
      }
      const response = await safeFetch(
        new URL('v1/internal/channel-deliveries', baseUrl),
        {
          body: JSON.stringify(request),
          headers: {
            Authorization: `Bearer ${internalApiKey}`,
            'Content-Type': 'application/json',
          },
          method: 'POST',
          signal: AbortSignal.timeout(
            NotificationsService.EMAIL_DELIVERY_TIMEOUT_MS,
          ),
        },
        { allowedOrigins: [baseUrl.origin], allowPrivateNetwork: true },
      );
      statusCode = response.status;
      if (!response.ok) {
        explicitRetryability = (
          await this.readEmailDeliveryErrorResponse(response)
        )?.retryable;
        throw new Error(
          `Notifications service returned HTTP ${response.status}`,
        );
      }
      const body: unknown = await response.json();
      const outcome = readChannelDeliveryResponse(body);
      if (!outcome) {
        throw new Error(
          'Notifications service returned an invalid delivery response',
        );
      }
      return outcome;
    } catch (error: unknown) {
      this.logger.error(
        `${this.constructorName} channel delivery failed`,
        new Error('Channel delivery request failed'),
        {
          action: request.message.action,
          channel: request.message.type,
          ...(statusCode === undefined ? {} : { statusCode }),
        },
      );
      throw new ChannelDeliveryError(
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
}
