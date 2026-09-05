import {
  EmailDeliveryError,
  NotificationsService,
} from '@api/services/notifications/notifications.service';
import {
  AGENT_STATUS_NOTIFICATION_TOPIC,
  EMAIL_NOTIFICATION_CHANNEL,
  NOTIFICATION_DELIVERY_STATUS,
  WORKFLOW_STATUS_NOTIFICATION_TOPIC,
  type WorkflowStatusNotificationPayload,
} from '@api/services/notifications/workflow-notifications/workflow-notification.constants';
import { WorkflowNotificationQueueService } from '@api/services/notifications/workflow-notifications/workflow-notification-queue.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { AgentFailureReason } from '@genfeedai/contracts';
import {
  buildSystemEmailHtml,
  escapeSystemEmailHtml,
} from '@helpers/email/system-email.helper';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

const LOCK_LEASE_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_RECOVERY_BATCH = 100;

@Injectable()
export class WorkflowNotificationDeliveryService {
  private readonly context = {
    service: WorkflowNotificationDeliveryService.name,
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly queueService: WorkflowNotificationQueueService,
    private readonly logger: LoggerService,
  ) {}

  async deliver(deliveryId: string): Promise<void> {
    const now = new Date();
    const leaseExpiredAt = new Date(now.getTime() - LOCK_LEASE_MS);
    // tenant-scope-ignore: system worker claims an opaque globally unique delivery id whose durable row retains organizationId
    const claim = await this.prisma.notificationDelivery.updateMany({
      data: {
        attemptCount: { increment: 1 },
        lockedAt: now,
        status: NOTIFICATION_DELIVERY_STATUS.PROCESSING,
      },
      where: {
        id: deliveryId,
        isDeleted: false,
        OR: [
          {
            nextAttemptAt: { lte: now },
            status: {
              in: [
                NOTIFICATION_DELIVERY_STATUS.PENDING,
                NOTIFICATION_DELIVERY_STATUS.RETRY_PENDING,
              ],
            },
          },
          {
            lockedAt: { lte: leaseExpiredAt },
            status: NOTIFICATION_DELIVERY_STATUS.PROCESSING,
          },
        ],
      },
    });

    if (claim.count !== 1) {
      return;
    }

    // tenant-scope-ignore: claimed opaque delivery id resolves organizationId and is never sourced from an end-user query
    const delivery = await this.prisma.notificationDelivery.findUnique({
      include: {
        event: true,
        user: { select: { email: true, isDeleted: true } },
      },
      where: { id: deliveryId },
    });

    if (!delivery) {
      return;
    }

    if (delivery.attemptCount > MAX_ATTEMPTS) {
      await this.failPermanently(
        deliveryId,
        delivery.organizationId,
        'Retry limit exceeded after interrupted delivery',
      );
      return;
    }

    const isAgentFailure = delivery.topic === AGENT_STATUS_NOTIFICATION_TOPIC;
    if (
      delivery.channel !== EMAIL_NOTIFICATION_CHANNEL ||
      (delivery.topic !== WORKFLOW_STATUS_NOTIFICATION_TOPIC &&
        !isAgentFailure) ||
      delivery.event.sourceType !==
        (isAgentFailure ? 'agent_run' : 'workflow_execution')
    ) {
      await this.failPermanently(
        deliveryId,
        delivery.organizationId,
        'Invalid notification source or topic',
      );
      return;
    }

    // tenant-scope-ignore: preferences are globally user-owned; delivery.userId comes from the organization-scoped claimed delivery above
    const preference = await this.prisma.notificationPreference.findFirst({
      select: { isEnabled: true },
      where: {
        channel: EMAIL_NOTIFICATION_CHANNEL,
        isDeleted: false,
        isEnabled: true,
        topic: delivery.topic,
        userId: delivery.userId,
      },
    });

    if (!preference || delivery.user.isDeleted || !delivery.user.email) {
      await this.skip(
        deliveryId,
        delivery.organizationId,
        'recipient_disabled_or_unavailable',
      );
      return;
    }

    const payload = this.readPayload(delivery.event.payload);
    if (
      !payload ||
      (isAgentFailure && (payload.status !== 'failed' || !payload.failure))
    ) {
      await this.failPermanently(
        deliveryId,
        delivery.organizationId,
        'Invalid workflow notification payload',
      );
      return;
    }

    try {
      const email = this.buildEmail(payload, isAgentFailure);
      const providerMessageId = await this.notificationsService.deliverEmail({
        ...email,
        idempotencyKey: delivery.idempotencyKey,
        to: delivery.user.email,
      });

      await this.prisma.notificationDelivery.updateMany({
        data: {
          deliveredAt: new Date(),
          lastError: null,
          lockedAt: null,
          providerMessageId,
          status: NOTIFICATION_DELIVERY_STATUS.DELIVERED,
        },
        where: {
          id: deliveryId,
          isDeleted: false,
          organizationId: delivery.organizationId,
        },
      });
    } catch (error: unknown) {
      if (error instanceof EmailDeliveryError && !error.retryable) {
        await this.failPermanently(
          deliveryId,
          delivery.organizationId,
          error.message,
        );
        return;
      }
      await this.recordFailure(
        deliveryId,
        delivery.organizationId,
        delivery.attemptCount,
        error,
      );
    }
  }

  async recoverDueDeliveries(): Promise<number> {
    const now = new Date();
    const leaseExpiredAt = new Date(now.getTime() - LOCK_LEASE_MS);
    // tenant-scope-ignore: system recovery intentionally spans tenants and selects only non-deleted due delivery ids
    const deliveries = await this.prisma.notificationDelivery.findMany({
      orderBy: { nextAttemptAt: 'asc' },
      select: { id: true },
      take: MAX_RECOVERY_BATCH,
      where: {
        isDeleted: false,
        OR: [
          {
            nextAttemptAt: { lte: now },
            status: {
              in: [
                NOTIFICATION_DELIVERY_STATUS.PENDING,
                NOTIFICATION_DELIVERY_STATUS.RETRY_PENDING,
              ],
            },
          },
          {
            lockedAt: { lte: leaseExpiredAt },
            status: NOTIFICATION_DELIVERY_STATUS.PROCESSING,
          },
        ],
      },
    });

    const enqueueResults = await Promise.allSettled(
      deliveries.map(({ id }) => this.queueService.enqueue(id)),
    );
    let recoveredCount = 0;

    for (const [index, result] of enqueueResults.entries()) {
      if (result.status === 'fulfilled') {
        recoveredCount += 1;
        continue;
      }

      this.logger.error(
        'Durable notification recovery enqueue failed',
        result.reason,
        {
          ...this.context,
          deliveryId: deliveries[index]?.id,
        },
      );
    }

    return recoveredCount;
  }

  private async skip(
    deliveryId: string,
    organizationId: string,
    reason: string,
  ): Promise<void> {
    await this.prisma.notificationDelivery.updateMany({
      data: {
        lastError: reason,
        lockedAt: null,
        skippedAt: new Date(),
        status: NOTIFICATION_DELIVERY_STATUS.SKIPPED,
      },
      where: { id: deliveryId, isDeleted: false, organizationId },
    });
  }

  private async failPermanently(
    deliveryId: string,
    organizationId: string,
    reason: string,
  ): Promise<void> {
    await this.prisma.notificationDelivery.updateMany({
      data: {
        lastError: reason,
        lockedAt: null,
        status: NOTIFICATION_DELIVERY_STATUS.FAILED,
      },
      where: { id: deliveryId, isDeleted: false, organizationId },
    });
  }

  private async recordFailure(
    deliveryId: string,
    organizationId: string,
    attemptCount: number,
    error: unknown,
  ): Promise<void> {
    const message =
      error instanceof Error
        ? error.message.slice(0, 1000)
        : 'Email delivery failed';
    const isExhausted = attemptCount >= MAX_ATTEMPTS;
    const backoffMs = Math.min(60 * 60 * 1000, 30_000 * 2 ** attemptCount);

    await this.prisma.notificationDelivery.updateMany({
      data: {
        lastError: message,
        lockedAt: null,
        nextAttemptAt: new Date(Date.now() + backoffMs),
        status: isExhausted
          ? NOTIFICATION_DELIVERY_STATUS.FAILED
          : NOTIFICATION_DELIVERY_STATUS.RETRY_PENDING,
      },
      where: { id: deliveryId, isDeleted: false, organizationId },
    });

    this.logger.warn('Workflow notification delivery failed', {
      ...this.context,
      attemptCount,
      deliveryId,
      isExhausted,
    });
  }

  private readPayload(
    value: unknown,
  ): WorkflowStatusNotificationPayload | null {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const payload = value as Record<string, unknown>;
    if (
      payload.version !== 1 ||
      typeof payload.executionId !== 'string' ||
      typeof payload.workflowId !== 'string' ||
      typeof payload.workflowLabel !== 'string' ||
      (payload.status !== 'completed' && payload.status !== 'failed')
    ) {
      return null;
    }

    let failure: WorkflowStatusNotificationPayload['failure'] = null;
    if (payload.failure !== undefined && payload.failure !== null) {
      if (typeof payload.failure !== 'object') return null;
      const value = payload.failure as Record<string, unknown>;
      if (
        !Object.values(AgentFailureReason).some(
          (reason) => reason === value.reason,
        ) ||
        typeof value.title !== 'string' ||
        typeof value.summary !== 'string' ||
        (value.recovery !== null && typeof value.recovery !== 'string') ||
        typeof value.isConfigurationError !== 'boolean' ||
        typeof value.isRetryable !== 'boolean'
      )
        return null;
      failure = {
        reason: value.reason as AgentFailureReason,
        title: value.title,
        summary: value.summary,
        recovery: value.recovery as string | null,
        detail: null,
        isConfigurationError: value.isConfigurationError,
        isRetryable: value.isRetryable,
      };
    }

    return {
      failure,
      error: typeof payload.error === 'string' ? payload.error : null,
      executionId: payload.executionId,
      status: payload.status,
      trigger: typeof payload.trigger === 'string' ? payload.trigger : null,
      workflowId: payload.workflowId,
      workflowLabel: payload.workflowLabel,
      version: 1,
    };
  }

  private buildEmail(
    payload: WorkflowStatusNotificationPayload,
    isAgentFailure: boolean,
  ): {
    html: string;
    subject: string;
    text: string;
  } {
    const isFailure = payload.status === 'failed';
    const subject = isFailure
      ? `${isAgentFailure ? 'Agent run' : 'Workflow'} failed: ${payload.workflowLabel}`
      : `Workflow completed: ${payload.workflowLabel}`;
    if (isFailure && payload.failure) {
      const { title, summary, recovery } = payload.failure;
      const text = [subject, title, summary, recovery]
        .filter(Boolean)
        .join('\n');
      const bodyHtml = [title, summary, recovery]
        .filter((value): value is string => typeof value === 'string')
        .map((value) => `<p>${escapeSystemEmailHtml(value)}</p>`)
        .join('');
      return {
        html: buildSystemEmailHtml({ bodyHtml, title: subject }),
        subject,
        text,
      };
    }
    const escapedLabel = escapeSystemEmailHtml(payload.workflowLabel);
    const escapedError = payload.error
      ? `: ${escapeSystemEmailHtml(payload.error)}`
      : '.';
    const bodyHtml = isFailure
      ? `<p>Your workflow <strong>${escapedLabel}</strong> failed${escapedError}</p>`
      : `<p>Your workflow <strong>${escapedLabel}</strong> completed successfully.</p>`;

    return {
      html: buildSystemEmailHtml({ bodyHtml, title: subject }),
      subject,
      text: isFailure
        ? `Your workflow ${payload.workflowLabel} failed${payload.error ? `: ${payload.error}` : '.'}`
        : `Your workflow ${payload.workflowLabel} completed successfully.`,
    };
  }
}
