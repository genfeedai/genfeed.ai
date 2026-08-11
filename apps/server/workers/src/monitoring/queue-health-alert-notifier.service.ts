import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@workers/config/config.service';
import type { QueueHealthNotification } from '@workers/monitoring/queue-health.types';

const ALERT_TIMEOUT_MS = 5_000;

/**
 * Operations-only queue health notifications.
 *
 * The payload is deliberately derived from queue metadata only. Job data,
 * identifiers, failure reasons, tenant data, and webhook credentials never
 * enter either the structured log context or the outbound body.
 */
@Injectable()
export class QueueHealthAlertNotifierService {
  private readonly context = { service: QueueHealthAlertNotifierService.name };

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {}

  async notify(notification: QueueHealthNotification): Promise<void> {
    const safeContext = {
      breaches: notification.breaches,
      incidentStartedAt: notification.incidentStartedAt,
      notificationKind: notification.kind,
      snapshot: notification.snapshot,
      ...this.context,
    };

    if (notification.kind === 'breach') {
      this.logger.warn('BullMQ queue health threshold breached', safeContext);
    } else {
      this.logger.log('BullMQ queue health recovered', safeContext);
    }

    const webhookUrl = this.configService.queueHealthAlertWebhookUrl;
    if (!webhookUrl) {
      return;
    }

    let response: Response;
    try {
      response = await fetch(webhookUrl, {
        body: JSON.stringify({
          text: this.formatSlackCompatibleText(notification),
        }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
        signal: AbortSignal.timeout(ALERT_TIMEOUT_MS),
      });
    } catch {
      // Incoming-webhook credentials commonly live in the URL path. Never
      // propagate a transport error that might echo the configured URL.
      throw new Error('Queue health alert webhook request failed');
    }

    if (!response.ok) {
      throw new Error(
        `Queue health alert webhook returned HTTP ${response.status}`,
      );
    }
  }

  private formatSlackCompatibleText(
    notification: QueueHealthNotification,
  ): string {
    const { snapshot } = notification;
    const state = notification.kind === 'breach' ? 'BREACHED' : 'RECOVERED';
    const breachSummary = notification.breaches
      .map(
        (breach) => `${breach.kind}=${breach.actual} (max ${breach.threshold})`,
      )
      .join(', ');

    return [
      `[Genfeed queue health ${state}] ${snapshot.queueName}`,
      `waiting=${snapshot.waiting}`,
      `active=${snapshot.active}`,
      `delayed=${snapshot.delayed}`,
      `failed=${snapshot.failed}`,
      `oldestWaitingSeconds=${snapshot.oldestWaitingAgeSeconds}`,
      breachSummary ? `thresholds: ${breachSummary}` : null,
      `capturedAt=${snapshot.capturedAt}`,
    ]
      .filter((part): part is string => Boolean(part))
      .join(' | ');
  }
}
