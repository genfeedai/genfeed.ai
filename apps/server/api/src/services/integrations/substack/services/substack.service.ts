import * as crypto from 'node:crypto';
import {
  assertSafeWebhookHeaders,
  assertSafeWebhookUrl,
} from '@api/shared/utils/webhook-validator/webhook-validator.util';
import { LoggerService } from '@libs/logger/logger.service';
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

export interface SubstackDraftInput {
  publication?: string;
  title: string;
  markdown: string;
}

export interface SubstackDraftResult {
  provider: 'substack';
  pushed: boolean;
  mode: 'draft';
  draftUrl: string | null;
  reason: 'no_public_write_api';
  note: string;
}

export interface SubstackWebhookDeliveryInput {
  webhookUrl?: string;
  webhookHeaders?: Record<string, string>;
  webhookSecret?: string;
  payload: Record<string, unknown>;
}

export interface SubstackWebhookDeliveryResult {
  status: 'skipped' | 'blocked' | 'delivered' | 'failed';
  endpoint: string | null;
  statusCode?: number;
  reason?: string;
}

/**
 * Substack currently has no official public write API for programmatic draft/post creation.
 * This service is an integration boundary for future support and provides explicit fallback metadata.
 */
@Injectable()
export class SubstackService {
  constructor(
    private readonly httpService: HttpService,
    private readonly logger: LoggerService,
  ) {}

  createDraft(_input: SubstackDraftInput): Promise<SubstackDraftResult> {
    return Promise.resolve({
      draftUrl: null,
      mode: 'draft',
      note: 'Substack has no official public write API; draft must be created manually.',
      provider: 'substack',
      pushed: false,
      reason: 'no_public_write_api',
    });
  }

  async deliverDraftWebhook(
    input: SubstackWebhookDeliveryInput,
  ): Promise<SubstackWebhookDeliveryResult> {
    if (!input.webhookUrl) {
      return {
        endpoint: null,
        reason: 'webhook_url_not_configured',
        status: 'skipped',
      };
    }

    // SSRF guard: validate URL scheme and resolve hostname against private/reserved ranges.
    // assertSafeWebhookUrl throws BadRequestException on any violation.
    await assertSafeWebhookUrl(input.webhookUrl);

    // Header injection guard: strip forbidden headers and reject CR/LF injection attempts.
    const safeHeaders = assertSafeWebhookHeaders(input.webhookHeaders);

    const rawPayload = JSON.stringify(input.payload);
    const signature = input.webhookSecret
      ? crypto
          .createHmac('sha256', input.webhookSecret)
          .update(rawPayload)
          .digest('hex')
      : null;

    try {
      const response = await firstValueFrom(
        this.httpService.post(input.webhookUrl, input.payload, {
          headers: {
            'Content-Type': 'application/json',
            ...safeHeaders,
            ...(signature
              ? { 'X-Genfeed-Signature': `sha256=${signature}` }
              : {}),
            'X-Genfeed-Event': 'newsletter.draft.ready',
          },
          timeout: 30000,
          validateStatus: (status) => status < 500,
        }),
      );

      return {
        endpoint: input.webhookUrl,
        status: response.status >= 400 ? 'failed' : 'delivered',
        statusCode: response.status,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Substack webhook delivery failed', {
        endpoint: input.webhookUrl,
        error: message,
      });

      return {
        endpoint: input.webhookUrl,
        reason: message,
        status: 'failed',
      };
    }
  }
}
