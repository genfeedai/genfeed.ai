import * as crypto from 'node:crypto';
import { ConfigService } from '@api/config/config.service';
import { NotificationsService } from '@api/services/notifications/notifications.service';
import { VercelWebhookPayload } from '@libs/interfaces/webhook-payload.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

type VercelWebhookMeta = {
  githubCommitMessage?: string;
  githubCommitSha?: string;
};

type VercelWebhookActor = {
  name?: string;
  username?: string;
};

type VercelWebhookDeployment = {
  meta?: VercelWebhookMeta;
  target?: string;
  url?: string;
};

type VercelWebhookBody = {
  alias?: string[];
  creator?: VercelWebhookActor;
  deployment?: VercelWebhookDeployment;
  environment?: string;
  event?: string;
  meta?: VercelWebhookMeta;
  name?: string;
  payload?: VercelWebhookBody;
  project?: { name?: string };
  target?: string;
  type?: string;
  url?: string;
  user?: VercelWebhookActor;
};

@Injectable()
export class VercelWebhookService {
  constructor(
    private readonly configService: ConfigService,
    private readonly notificationsService: NotificationsService,
    private readonly loggerService: LoggerService,
  ) {}

  validateSignature(rawBody: Buffer, signature: string): boolean {
    try {
      const secret = this.configService.get('VERCEL_WEBHOOK_SECRET');

      if (!secret) {
        this.loggerService.warn(
          'VERCEL_WEBHOOK_SECRET not configured, skipping validation',
        );
        return true; // Allow webhooks if secret not configured (for dev)
      }

      if (!signature) {
        return false;
      }

      // Vercel uses SHA1 HMAC for webhook signatures
      // See: https://vercel.com/docs/rest-api and community discussions
      const hmac = crypto.createHmac('sha1', secret);
      const digest = hmac.update(rawBody).digest('hex');

      // Timing-safe comparison
      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(digest),
      );
    } catch (error: unknown) {
      this.loggerService.error('Signature validation failed', error);
      return false;
    }
  }

  async handleWebhook(payload: VercelWebhookPayload): Promise<void> {
    const body = payload as VercelWebhookBody;
    const type = body.type || body.event || 'deployment.unknown';
    const p = body.payload || body;

    const project = p?.project?.name || p?.name || 'unknown-project';
    const environment =
      p?.deployment?.target || p?.target || p?.environment || 'production';

    // Prefer alias[0] (production domain) over deployment.url (temporary URL)
    const alias = p?.alias?.[0];
    const deploymentUrl = p?.deployment?.url || p?.url;
    const url = alias
      ? `https://${alias}`
      : deploymentUrl
        ? `https://${deploymentUrl}`
        : undefined;
    const creator = p?.creator?.username || p?.user?.name || 'system';
    const commitMessage =
      p?.deployment?.meta?.githubCommitMessage || p?.meta?.githubCommitMessage;
    const commitSha =
      p?.deployment?.meta?.githubCommitSha || p?.meta?.githubCommitSha;

    const typeLabel = String(type);
    const color = typeLabel.includes('ready')
      ? 0x22c55e
      : typeLabel.includes('error') || typeLabel.includes('canceled')
        ? 0xef4444
        : 0x6366f1;

    const titleMap: Record<string, string> = {
      'deployment.canceled': '🛑 Deployment canceled',
      'deployment.created': '🚀 Deployment started',
      'deployment.error': '❌ Deployment failed',
      'deployment.ready': '✅ Deployment ready',
      'deployment.succeeded': '✅ Deployment succeeded',
    };

    const embed = {
      color,
      description: commitMessage ? `**Commit:** ${commitMessage}` : undefined,
      fields: [
        { inline: true, name: 'Project', value: `\`${project}\`` },
        { inline: true, name: 'Env', value: `\`${environment}\`` },
        ...(commitSha
          ? [
              {
                inline: true,
                name: 'Commit',
                value: `\`${commitSha.substring(0, 7)}\``,
              },
            ]
          : []),
        ...(url ? [{ inline: false, name: 'Preview', value: url }] : []),
        { inline: true, name: 'Triggered by', value: creator },
      ],
      timestamp: new Date().toISOString(),
      title: titleMap[typeLabel] ?? `ℹ️ ${typeLabel}`,
      url,
    };

    this.loggerService.log('Vercel webhook routing', {
      deploymentType: typeLabel,
      embedTitle: embed.title,
      environment,
      project,
      url,
    });

    try {
      await this.notificationsService.sendVercelNotification({
        embed,
      });
      this.loggerService.log('Vercel webhook published to Redis', {
        project,
      });
    } catch (error: unknown) {
      this.loggerService.error('Vercel webhook send failed', error);
      throw error;
    }
  }
}
