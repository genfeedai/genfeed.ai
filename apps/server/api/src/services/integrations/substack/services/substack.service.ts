import * as crypto from 'node:crypto';
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

    if (!isAllowedWebhookUrl(input.webhookUrl)) {
      return {
        endpoint: input.webhookUrl,
        reason: 'webhook_url_blocked',
        status: 'blocked',
      };
    }

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

/**
 * Returns true only for HTTPS URLs with a public, non-IP hostname.
 *
 * Rejects:
 * - Non-HTTPS schemes (http://, ftp://, file://, ...)
 * - Bare IPv4 / IPv6 addresses (blocks DNS-rebinding via numeric IPs entirely)
 * - RFC1918 and other private/reserved IPv4 ranges:
 *     0.0.0.0/8, 10.0.0.0/8, 100.64.0.0/10 (CGN),
 *     127.0.0.0/8, 169.254.0.0/16 (link-local / AWS metadata),
 *     172.16.0.0/12, 192.168.0.0/16
 * - Private/reserved IPv6: loopback (::1), unspecified (::),
 *     ULA (fc00::/7), link-local (fe80::/10)
 */
export function isAllowedWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url);

    // HTTPS only — reject http://, file://, etc.
    if (parsed.protocol !== 'https:') {
      return false;
    }

    const hostname = parsed.hostname;

    // Reject empty hostname
    if (!hostname) {
      return false;
    }

    // Block bare IPv4 addresses (e.g. "1.2.3.4")
    const isIPv4 = /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
    if (isIPv4) {
      return false;
    }

    // Block bare IPv6 addresses — URL.hostname returns them wrapped in [ ]
    const isIPv6 = hostname.startsWith('[') && hostname.endsWith(']');
    if (isIPv6) {
      return false;
    }

    // Block "localhost" and any subdomain of it
    if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}
