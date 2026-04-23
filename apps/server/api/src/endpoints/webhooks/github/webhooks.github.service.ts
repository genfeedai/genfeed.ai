import { createHmac, timingSafeEqual } from 'node:crypto';
import { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable, UnauthorizedException } from '@nestjs/common';

interface SecretAlert {
  token: string;
  type: string;
  url: string;
  source?: string;
}

interface AlertResult {
  token_raw: string;
  token_type: string;
  label: string;
}

@Injectable()
export class GitHubWebhookService {
  constructor(
    private readonly logger: LoggerService,
    private readonly apiKeysService: ApiKeysService,
  ) {}

  validateSignature(rawBody: Buffer, signature: string): void {
    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    if (!secret) {
      throw new UnauthorizedException('Webhook secret not configured');
    }

    if (!signature) {
      throw new UnauthorizedException('Missing signature header');
    }

    const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;

    const sigBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);

    if (
      sigBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(sigBuffer, expectedBuffer)
    ) {
      throw new UnauthorizedException('Invalid signature');
    }
  }

  async handleSecretAlerts(alerts: unknown[]): Promise<AlertResult[]> {
    const results: AlertResult[] = [];

    for (const raw of alerts) {
      const alert = raw as SecretAlert;
      try {
        const result = await this.processAlert(alert);
        results.push(result);
      } catch (error) {
        this.logger.error(
          `Failed to process GitHub secret alert: ${(error as Error).message}`,
          { type: alert.type, url: alert.url },
        );
        results.push({
          label: 'error',
          token_raw: alert.token,
          token_type: alert.type,
        });
      }
    }

    return results;
  }

  private async processAlert(alert: SecretAlert): Promise<AlertResult> {
    this.logger.log('Processing GitHub secret scanning alert', {
      source: alert.source,
      type: alert.type,
      url: alert.url,
    });

    const apiKey = await this.apiKeysService.findByKey(alert.token);

    if (!apiKey) {
      this.logger.log('Token not found or already revoked — false positive', {
        type: alert.type,
      });
      return {
        label: 'false_positive',
        token_raw: alert.token,
        token_type: alert.type,
      };
    }

    await this.apiKeysService.revoke(apiKey.id);

    this.logger.warn('API key auto-revoked via GitHub Secret Scanning', {
      keyId: apiKey.id,
      source: alert.source,
      url: alert.url,
    });

    return {
      label: 'true_positive',
      token_raw: alert.token,
      token_type: alert.type,
    };
  }
}
