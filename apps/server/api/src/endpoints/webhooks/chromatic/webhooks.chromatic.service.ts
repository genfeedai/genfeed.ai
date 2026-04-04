import * as crypto from 'node:crypto';
import { ConfigService } from '@api/config/config.service';
import { NotificationsService } from '@api/services/notifications/notifications.service';
import type { ChromaticWebhookPayload } from '@libs/interfaces/webhook-payload.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ChromaticWebhookService {
  constructor(
    private readonly configService: ConfigService,
    private readonly notificationsService: NotificationsService,
    private readonly loggerService: LoggerService,
  ) {}

  validateSignature(rawBody: Buffer, signature: string): boolean {
    try {
      const secret = this.configService.get('CHROMATIC_WEBHOOK_SECRET');

      if (!secret) {
        this.loggerService.warn(
          'CHROMATIC_WEBHOOK_SECRET not configured, skipping validation',
        );
        return true; // Allow webhooks if secret not configured (for dev)
      }

      if (!signature) {
        return false;
      }

      // Chromatic uses SHA256 HMAC for webhook signatures
      // See: https://www.chromatic.com/docs/custom-webhooks
      const hmac = crypto.createHmac('sha256', secret);
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

  async handleWebhook(payload: ChromaticWebhookPayload): Promise<void> {
    const event = payload.event || 'build.unknown';
    const build = payload.build || {};
    const project = payload.project?.name || 'unknown-project';
    const branch = payload.branch || 'develop';
    const status = build.status || 'UNKNOWN';
    const buildNumber = build.number || 0;
    const changeCount = build.changeCount || 0;
    const errorCount = build.errorCount || 0;
    const testCount = build.testCount || 0;
    const buildUrl = build.webUrl || build.url;
    const commitMessage = payload.commit?.message;
    const commitSha = payload.commit?.sha;
    const commitAuthor = payload.commit?.author;

    // Color-coded based on build status
    const color =
      status === 'PASSED'
        ? 0x22c55e // Green
        : status === 'FAILED'
          ? 0xef4444 // Red
          : status === 'APPROVED'
            ? 0x10b981 // Green (approved)
            : status === 'DENIED'
              ? 0xf59e0b // Orange (denied)
              : 0x6366f1; // Blue (pending/other)

    // Status emoji mapping
    const statusEmoji: Record<string, string> = {
      APPROVED: '✅',
      DENIED: '⛔',
      FAILED: '❌',
      IN_PROGRESS: '⏳',
      PASSED: '✅',
      PENDING: '🔄',
    };

    const emoji = statusEmoji[status] || 'ℹ️';

    const embed = {
      color,
      description: commitMessage ? `**Commit:** ${commitMessage}` : undefined,
      fields: [
        { inline: true, name: 'Project', value: `\`${project}\`` },
        { inline: true, name: 'Build', value: `#${buildNumber}` },
        { inline: true, name: 'Branch', value: `\`${branch}\`` },
        ...(testCount > 0
          ? [
              {
                inline: true,
                name: 'Tests',
                value: `${testCount}`,
              },
            ]
          : []),
        ...(changeCount > 0
          ? [
              {
                inline: true,
                name: 'Changes',
                value: `${changeCount}`,
              },
            ]
          : []),
        ...(errorCount > 0
          ? [
              {
                inline: true,
                name: 'Errors',
                value: `${errorCount}`,
              },
            ]
          : []),
        ...(commitSha
          ? [
              {
                inline: true,
                name: 'Commit',
                value: `\`${commitSha.substring(0, 7)}\``,
              },
            ]
          : []),
        ...(commitAuthor
          ? [
              {
                inline: true,
                name: 'Author',
                value: commitAuthor,
              },
            ]
          : []),
        ...(buildUrl
          ? [
              {
                inline: false,
                name: 'View Build',
                value: buildUrl,
              },
            ]
          : []),
      ],
      timestamp: new Date().toISOString(),
      title: `${emoji} Chromatic Build ${status}`,
      url: buildUrl,
    };

    this.loggerService.log('Chromatic webhook routing', {
      branch,
      buildNumber,
      embedTitle: embed.title,
      event,
      project,
      status,
    });

    try {
      await this.notificationsService.sendChromaticNotification({
        embed,
      });
      this.loggerService.log('Chromatic webhook published to Redis', {
        buildNumber,
        project,
      });
    } catch (error: unknown) {
      this.loggerService.error('Chromatic webhook send failed', error);
      throw error;
    }
  }
}
