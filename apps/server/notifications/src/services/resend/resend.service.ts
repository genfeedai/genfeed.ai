import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@notifications/config/config.service';
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
    private readonly configService: ConfigService,
    private readonly loggerService: LoggerService,
  ) {}

  async sendEmail(payload: ResendEmailPayload): Promise<string | null> {
    const url = `${this.constructorName} ${CallerUtil.getCallerName()}`;

    if (!this.configService.isResendEnabled()) {
      this.loggerService.warn(`${url} skipped - Resend not configured`);
      return null;
    }

    if (this.configService.isDevelopment) {
      this.loggerService.log(`${url} skipped`, payload);
      return null;
    }

    try {
      const resend = new Resend(this.configService.get('RESEND_API_KEY') || '');
      const response = await resend.emails.send(
        {
          from:
            payload.from ||
            this.configService.get('RESEND_FROM_EMAIL') ||
            'Genfeed <no-reply@genfeed.ai>',
          html: payload.html,
          replyTo:
            payload.replyTo || this.configService.get('RESEND_REPLY_TO_EMAIL'),
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
        subject: payload.subject,
        to: payload.to,
      });

      return response.data?.id ?? null;
    } catch (error: unknown) {
      const deliveryError =
        error instanceof ResendEmailDeliveryError
          ? error
          : ResendEmailDeliveryError.fromCause(error);

      this.loggerService.error(`${url} failed`, error, {
        provider: 'resend',
        providerCode: deliveryError.providerCode,
        retryable: deliveryError.retryable,
        statusCode: deliveryError.statusCode,
      });

      throw deliveryError;
    }
  }
}
