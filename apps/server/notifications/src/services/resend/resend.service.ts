import { LoggerService } from '@libs/logger/logger.service';
import { CallerUtil } from '@libs/utils/caller/caller.util';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@notifications/config/config.service';
import { Resend } from 'resend';

export interface ResendEmailPayload {
  readonly to: string;
  readonly subject: string;
  readonly html: string;
  readonly text?: string;
  readonly from?: string;
  readonly replyTo?: string;
  readonly idempotencyKey?: string;
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

    const resend = new Resend(this.configService.get('RESEND_API_KEY') || '');

    try {
      const response = await resend.emails.send(
        {
          from:
            payload.from ||
            this.configService.get('RESEND_FROM_EMAIL') ||
            'Genfeed <updates@genfeed.ai>',
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
        this.loggerService.error(`${url} failed`, response.error);
        return null;
      }

      this.loggerService.log(`${url} success`, {
        emailId: response.data?.id ?? null,
        subject: payload.subject,
        to: payload.to,
      });

      return response.data?.id ?? null;
    } catch (error: unknown) {
      this.loggerService.error(`${url} failed`, error);
      return null;
    }
  }
}
