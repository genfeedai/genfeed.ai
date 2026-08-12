/**
 * X Activity / Account Activity subscription helpers (connect later).
 * Registers webhook URL and user subscriptions when env is configured.
 */
import { buildXActivityCrcResponseBody } from '@api/services/reply-bot/x-activity-crc.util';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export type XActivitySubscribeResult = {
  mode: 'live' | 'skipped';
  message: string;
  webhookId?: string;
  subscriptionOk?: boolean;
};

@Injectable()
export class XActivitySubscriptionService {
  private readonly constructorName = String(this.constructor.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {}

  isEnabled(): boolean {
    const flag = this.configService.get<string>('X_ACTIVITY_WEBHOOK_ENABLED');
    return flag === 'true' || flag === '1';
  }

  /**
   * Public base URL for the X webhook endpoint (no trailing slash).
   * e.g. https://api.genfeed.ai/v1/webhooks/x-activity
   */
  getWebhookUrl(): string | undefined {
    const explicit = this.readConfigString('X_ACTIVITY_WEBHOOK_URL');
    if (explicit) {
      return explicit.replace(/\/$/, '');
    }
    const apiBase =
      this.readConfigString('API_PUBLIC_URL') ||
      this.readConfigString('PORTLESS_URL') ||
      this.readConfigString('APP_URL');
    if (!apiBase) {
      return undefined;
    }
    const base = apiBase.replace(/\/$/, '');
    if (base.includes('/v1/webhooks/x-activity')) {
      return base;
    }
    return `${base}/v1/webhooks/x-activity`;
  }

  getBearerToken(): string | undefined {
    return (
      this.readConfigString('X_API_BEARER_TOKEN') ||
      this.readConfigString('TWITTER_BEARER_TOKEN') ||
      undefined
    );
  }

  getConsumerSecret(): string | undefined {
    return (
      this.readConfigString('X_WEBHOOK_CONSUMER_SECRET') ||
      this.readConfigString('TWITTER_CONSUMER_SECRET') ||
      undefined
    );
  }

  private readConfigString(key: string): string | undefined {
    const value = this.configService.get(key);
    if (typeof value !== 'string') {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  /**
   * Preview CRC response (local self-test before X console registration).
   */
  previewCrc(crcToken: string): { response_token: string } | null {
    const secret = this.getConsumerSecret();
    if (!secret) {
      return null;
    }
    return buildXActivityCrcResponseBody(crcToken, secret);
  }

  /**
   * Attempt to ensure webhook registration + user subscription.
   * Skips cleanly when not enabled or missing tokens (connect later).
   */
  async ensureSubscriptionForUser(params: {
    /** X user id (credential.externalId) */
    externalUserId: string;
    /** User OAuth access token (decrypted) for subscription POST */
    userAccessToken?: string;
  }): Promise<XActivitySubscribeResult> {
    if (!this.isEnabled()) {
      return {
        message:
          'X_ACTIVITY_WEBHOOK_ENABLED is off — subscription skipped (pipe ready)',
        mode: 'skipped',
      };
    }

    const webhookUrl = this.getWebhookUrl();
    const bearer = this.getBearerToken();
    if (!webhookUrl || !bearer) {
      return {
        message:
          'Missing X_ACTIVITY_WEBHOOK_URL/API_PUBLIC_URL or TWITTER_BEARER_TOKEN — connect later',
        mode: 'skipped',
      };
    }

    try {
      const webhookId = await this.ensureWebhookRegistered(webhookUrl, bearer);
      if (!webhookId) {
        return {
          message: 'Could not register or list webhook id',
          mode: 'skipped',
        };
      }

      let subscriptionOk = false;
      if (params.userAccessToken) {
        subscriptionOk = await this.subscribeUser(
          webhookId,
          params.userAccessToken,
        );
      } else {
        this.logger.log(
          `${this.constructorName} webhook ready; user subscription needs userAccessToken`,
          { externalUserId: params.externalUserId, webhookId },
        );
      }

      return {
        message: subscriptionOk
          ? 'Webhook registered and user subscribed'
          : 'Webhook registered; user subscription pending token',
        mode: 'live',
        subscriptionOk,
        webhookId,
      };
    } catch (error: unknown) {
      this.logger.warn(`${this.constructorName} ensureSubscription failed`, {
        error: error instanceof Error ? error.message : 'unknown',
        externalUserId: params.externalUserId,
      });
      return {
        message: error instanceof Error ? error.message : 'subscription failed',
        mode: 'skipped',
      };
    }
  }

  private async ensureWebhookRegistered(
    webhookUrl: string,
    bearerToken: string,
  ): Promise<string | undefined> {
    // List existing
    const listRes = await fetch('https://api.x.com/2/webhooks', {
      headers: { Authorization: `Bearer ${bearerToken}` },
      method: 'GET',
    });
    if (listRes.ok) {
      const body = (await listRes.json()) as {
        data?: Array<{ id?: string; url?: string }>;
      };
      const existing = body.data?.find((row) => row.url === webhookUrl);
      if (existing?.id) {
        return existing.id;
      }
    }

    // Create
    const createRes = await fetch('https://api.x.com/2/webhooks', {
      body: JSON.stringify({ url: webhookUrl }),
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    });
    if (!createRes.ok) {
      const text = await createRes.text();
      this.logger.warn(`${this.constructorName} webhook create failed`, {
        status: createRes.status,
        text: text.slice(0, 300),
      });
      return undefined;
    }
    const created = (await createRes.json()) as {
      data?: { id?: string };
      id?: string;
    };
    return created.data?.id ?? created.id;
  }

  private async subscribeUser(
    webhookId: string,
    userAccessToken: string,
  ): Promise<boolean> {
    const res = await fetch(
      `https://api.x.com/2/account_activity/webhooks/${webhookId}/subscriptions/all`,
      {
        headers: { Authorization: `Bearer ${userAccessToken}` },
        method: 'POST',
      },
    );
    if (!res.ok) {
      const text = await res.text();
      this.logger.warn(`${this.constructorName} user subscribe failed`, {
        status: res.status,
        text: text.slice(0, 300),
        webhookId,
      });
      return false;
    }
    return true;
  }
}
