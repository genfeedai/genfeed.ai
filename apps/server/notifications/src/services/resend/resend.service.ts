import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@notifications/config/config.service';
import { NotificationRuntimeSettingsService } from '@notifications/services/runtime-settings/notification-runtime-settings.service';
import { type ErrorResponse, Resend } from 'resend';

export interface ResendEmailPayload {
  readonly to: string;
  readonly subject: string;
  readonly html: string;
  readonly text?: string;
  readonly from?: string;
  readonly replyTo?: string;
  readonly idempotencyKey?: string;
}

export interface ResendEmailDeliveryErrorOptions {
  readonly providerCode: ErrorResponse['name'] | null;
  readonly retryable: boolean;
  readonly statusCode: number | null;
}

export class ResendEmailDeliveryError extends Error {
  readonly providerCode: ErrorResponse['name'] | null;
  readonly retryable: boolean;
  readonly statusCode: number | null;

  constructor(message: string, options: ResendEmailDeliveryErrorOptions) {
    super(message);
    this.name = ResendEmailDeliveryError.name;
    this.providerCode = options.providerCode;
    this.retryable = options.retryable;
    this.statusCode = options.statusCode;
  }

  static fromResponse(error: ErrorResponse): ResendEmailDeliveryError {
    return new ResendEmailDeliveryError(error.message, {
      providerCode: error.name,
      retryable: isRetryableResendFailure(error),
      statusCode: error.statusCode,
    });
  }

  static fromCause(error: unknown): ResendEmailDeliveryError {
    return new ResendEmailDeliveryError(
      error instanceof Error ? error.message : 'Resend email delivery failed',
      {
        providerCode: null,
        retryable: true,
        statusCode: null,
      },
    );
  }
}

const RESEND_RETRYABILITY_OVERRIDES: Partial<
  Record<ErrorResponse['name'], boolean>
> = {
  concurrent_idempotent_requests: true,
  daily_quota_exceeded: false,
  monthly_quota_exceeded: false,
  rate_limit_exceeded: true,
};

const RETRYABLE_RESEND_STATUS_CODES = new Set([408, 425, 429]);

export const RESEND_DEFAULT_FROM = 'Genfeed <no-reply@send.genfeed.ai>';
export const RESEND_DEVELOPMENT_FROM = 'Genfeed <beth.t@example.com>';

export function resolveResendFromAddress(options: {
  configuredFrom: string | undefined;
  isDevelopment: boolean;
  payloadFrom?: string;
}): string {
  const explicit =
    options.payloadFrom?.trim() || options.configuredFrom?.trim();
  if (options.isDevelopment) {
    return explicit?.toLowerCase().includes('@resend.dev')
      ? explicit
      : RESEND_DEVELOPMENT_FROM;
  }
  return explicit || RESEND_DEFAULT_FROM;
}

function isRetryableResendFailure(error: ErrorResponse): boolean {
  const override = RESEND_RETRYABILITY_OVERRIDES[error.name];
  if (override !== undefined) {
    return override;
  }

  if (error.statusCode === null) {
    return true;
  }

  return (
    error.statusCode >= 500 ||
    RETRYABLE_RESEND_STATUS_CODES.has(error.statusCode)
  );
}

@Injectable()
export class ResendService {
  private readonly constructorName = ResendService.name;

  constructor(
    private readonly runtimeSettings: NotificationRuntimeSettingsService,
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
  ) {}

  /** Whether an email provider is configured; `sendEmail` no-ops without one. */
  isConfigured(): boolean {
    return this.configService.isResendEnabled();
  }

  async sendEmail(payload: ResendEmailPayload): Promise<string | null> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    if (!this.configService.isResendEnabled()) {
      this.loggerService.warn(`${url} skipped - Resend not configured`);
      return null;
    }

    try {
      const resend = new Resend(this.configService.get('RESEND_API_KEY') || '');
      const response = await resend.emails.send(
        {
          from: resolveResendFromAddress({
            configuredFrom:
              (await this.runtimeSettings.get()).emailFromAddress ?? undefined,
            isDevelopment: this.configService.isDevelopment,
            payloadFrom: payload.from,
          }),
          html: payload.html,
          replyTo:
            payload.replyTo ||
            ((await this.runtimeSettings.get()).emailReplyToAddress ??
              undefined),
          subject: payload.subject,
          text: payload.text,
          to: payload.to,
        },
        payload.idempotencyKey
          ? { idempotencyKey: payload.idempotencyKey }
          : undefined,
      );

      if (response.error) {
        throw ResendEmailDeliveryError.fromResponse(response.error);
      }

      this.loggerService.log(`${url} success`, {
        emailId: response.data?.id ?? null,
      });

      return response.data?.id ?? null;
    } catch (error: unknown) {
      const deliveryError =
        error instanceof ResendEmailDeliveryError
          ? error
          : ResendEmailDeliveryError.fromCause(error);
      let providerMessage = deliveryError.message;
      for (const sensitiveValue of [
        this.configService.get('RESEND_API_KEY'),
        payload.to,
      ]) {
        if (sensitiveValue) {
          providerMessage = providerMessage.replaceAll(
            sensitiveValue,
            '[REDACTED]',
          );
        }
      }

      this.loggerService.error(
        `${url} failed`,
        new Error('Email provider request failed'),
        {
          provider: 'resend',
          providerCode: deliveryError.providerCode,
          providerMessage,
          retryable: deliveryError.retryable,
          statusCode: deliveryError.statusCode,
        },
      );

      throw deliveryError;
    }
  }
}
