import { AgentReportDeliveryService } from '@api/services/agent-reports/agent-report-delivery.service';
import { EmailPerformanceService } from '@api/services/email-performance/email-performance.service';
import {
  EmailDeliveryError,
  NotificationsService,
} from '@api/services/notifications/notifications.service';
import {
  AGENT_STATUS_NOTIFICATION_TOPIC,
  type AgentReviewNotificationPayload,
  EMAIL_NOTIFICATION_CHANNEL,
  NOTIFICATION_DELIVERY_STATUS,
  readNotificationSourcePath,
  WORKFLOW_STATUS_NOTIFICATION_TOPIC,
  type WorkflowStatusNotificationPayload,
} from '@api/services/notifications/workflow-notifications/workflow-notification.constants';
import { WorkflowNotificationQueueService } from '@api/services/notifications/workflow-notifications/workflow-notification-queue.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { AgentFailureReason, MemberRole } from '@genfeedai/contracts';
import {
  buildSystemEmailHtml,
  escapeSystemEmailHtml,
} from '@helpers/email/system-email.helper';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable, Optional } from '@nestjs/common';

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
    @Optional() private readonly emailPerformance?: EmailPerformanceService,
    @Optional() private readonly configService?: ConfigService,
    @Optional()
    private readonly agentReportDelivery?: AgentReportDeliveryService,
  ) {}

  /**
   * Takes the lease on one delivery. The conditional update is the claim: it
   * succeeds for a due pending/retrying row, or for a processing row whose
   * lease has expired, and never for a row another worker currently holds.
   */
  private async claimDelivery(deliveryId: string): Promise<boolean> {
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

    return claim.count === 1;
  }

  async deliverAgentReport(
    organizationId: string,
    deliveryId: string,
    channel: 'email' | 'telegram' | 'discord',
  ): Promise<{ status: string; deliveryId: string }> {
    const where = {
      id: deliveryId,
      organizationId,
      isDeleted: false,
      topic: AGENT_STATUS_NOTIFICATION_TOPIC,
      channel,
      event: { sourceType: 'agent_run', organizationId, isDeleted: false },
    };
    const delivery = await this.prisma.notificationDelivery.findFirst({
      where,
      select: { id: true },
    });
    if (!delivery)
      throw new BadRequestException('Agent report delivery unavailable');
    await this.deliver(delivery.id);
    const outcome = await this.prisma.notificationDelivery.findFirst({
      where,
      select: { status: true },
    });
    if (!outcome)
      throw new BadRequestException('Agent report delivery unavailable');
    return { deliveryId: delivery.id, status: outcome.status };
  }

  async deliver(deliveryId: string): Promise<void> {
    if (!(await this.claimDelivery(deliveryId))) {
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

    if (delivery.event.sourceType === 'system_email' && this.emailPerformance) {
      await this.emailPerformance.deliverClaimed(deliveryId);
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

    if (
      delivery.topic === AGENT_STATUS_NOTIFICATION_TOPIC &&
      delivery.event.sourceType === 'agent_run' &&
      (delivery.channel === 'telegram' || delivery.channel === 'discord')
    ) {
      if (delivery.user.isDeleted) {
        await this.skip(
          deliveryId,
          delivery.organizationId,
          'recipient_unavailable',
        );
        return;
      }
      try {
        if (!this.agentReportDelivery)
          throw new Error('Agent report delivery unavailable');
        const outcome = await this.agentReportDelivery.deliver({
          organizationId: delivery.organizationId,
          userId: delivery.userId,
          channel: delivery.channel,
          idempotencyKey: delivery.idempotencyKey,
          payload: delivery.event.payload,
        });
        if (outcome.status === 'skipped')
          await this.skip(deliveryId, delivery.organizationId, outcome.reason);
        else
          await this.markDelivered(
            deliveryId,
            delivery.organizationId,
            outcome.providerMessageId,
          );
      } catch (error) {
        await this.recordFailure(
          deliveryId,
          delivery.organizationId,
          delivery.attemptCount,
          error,
        );
      }
      return;
    }

    const isAgentRun = delivery.topic === AGENT_STATUS_NOTIFICATION_TOPIC;
    const isAgentReview =
      isAgentRun && delivery.event.sourceType === 'agent_strategy';
    if (
      delivery.channel !== EMAIL_NOTIFICATION_CHANNEL ||
      (delivery.topic !== WORKFLOW_STATUS_NOTIFICATION_TOPIC && !isAgentRun) ||
      (!isAgentReview &&
        delivery.event.sourceType !==
          (isAgentRun ? 'agent_run' : 'workflow_execution'))
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
      'kind' in payload !== isAgentReview ||
      ('kind' in payload &&
        (payload.strategyId !== delivery.event.sourceId ||
          delivery.event.eventKey !==
            (payload.expired
              ? 'agent.review.expired'
              : 'agent.review.changed'))) ||
      (isAgentRun &&
        !('kind' in payload) &&
        payload.status === 'failed' &&
        !payload.failure)
    ) {
      await this.failPermanently(
        deliveryId,
        delivery.organizationId,
        'Invalid workflow notification payload',
      );
      return;
    }

    if (
      isAgentRun &&
      !(await this.canReceiveAgentOutcome(
        delivery.organizationId,
        delivery.userId,
        payload.strategyId,
        !isAgentReview,
      ))
    ) {
      await this.skip(
        deliveryId,
        delivery.organizationId,
        'recipient_membership_or_agent_access_revoked',
      );
      return;
    }

    try {
      const email = this.buildEmail(payload, isAgentRun);
      const providerMessageId = await this.notificationsService.deliverEmail({
        ...email,
        idempotencyKey: delivery.idempotencyKey,
        to: delivery.user.email,
      });

      await this.markDelivered(
        deliveryId,
        delivery.organizationId,
        providerMessageId,
      );
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
    if (this.emailPerformance) {
      try {
        await this.emailPerformance.recoverProviderEvents();
      } catch {
        this.logger.warn('Provider email event recovery will retry');
      }
    }
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

  private async markDelivered(
    deliveryId: string,
    organizationId: string,
    providerMessageId: string,
  ): Promise<void> {
    await this.prisma.notificationDelivery.updateMany({
      data: {
        deliveredAt: new Date(),
        lastError: null,
        lockedAt: null,
        providerMessageId,
        status: NOTIFICATION_DELIVERY_STATUS.DELIVERED,
      },
      where: { id: deliveryId, isDeleted: false, organizationId },
    });
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

  private async canReceiveAgentOutcome(
    organizationId: string,
    userId: string,
    strategyId?: string,
    requireOwner = true,
  ): Promise<boolean> {
    const member = await this.prisma.member.findFirst({
      where: {
        organizationId,
        userId,
        isActive: true,
        isDeleted: false,
        organization: { is: { isDeleted: false } },
        user: { is: { isDeleted: false } },
      },
      select: {
        role: { select: { key: true } },
        brands: {
          where: { organizationId, isDeleted: false },
          select: { id: true },
        },
      },
    });
    if (!member) return false;
    if (!strategyId) return true;
    const restrictBrands =
      member.role.key !== MemberRole.OWNER &&
      member.role.key !== MemberRole.ADMIN &&
      member.brands.length > 0;
    const strategy = await this.prisma.agentStrategy.findFirst({
      where: {
        id: strategyId,
        organizationId,
        ...(requireOwner ? { userId } : {}),
        isDeleted: false,
        OR: [
          { brandId: null },
          {
            brand: {
              is: {
                organizationId,
                isDeleted: false,
                ...(restrictBrands
                  ? { id: { in: member.brands.map((brand) => brand.id) } }
                  : {}),
              },
            },
          },
        ],
      },
      select: { id: true },
    });
    return Boolean(strategy);
  }

  private agentReportHref(
    baseUrl: unknown,
    sourcePath?: string,
  ): string | null {
    if (typeof baseUrl !== 'string' || !sourcePath) return null;
    try {
      const base = new URL(baseUrl);
      if (!['https:', 'http:'].includes(base.protocol)) return null;
      const href = new URL(sourcePath, base);
      return href.origin === base.origin ? href.toString() : null;
    } catch {
      return null;
    }
  }

  private readPayload(
    value: unknown,
  ): WorkflowStatusNotificationPayload | AgentReviewNotificationPayload | null {
    if (!value || typeof value !== 'object') {
      return null;
    }

    const payload = value as Record<string, unknown>;
    if (payload.kind === 'agent_review') {
      if (
        payload.version !== 1 ||
        typeof payload.strategyId !== 'string' ||
        typeof payload.strategyLabel !== 'string' ||
        typeof payload.postId !== 'string' ||
        typeof payload.platform !== 'string' ||
        typeof payload.autoPublishEnabled !== 'boolean' ||
        typeof payload.approvalStreak !== 'number' ||
        !Number.isSafeInteger(payload.approvalStreak) ||
        payload.approvalStreak < 0 ||
        typeof payload.expired !== 'boolean' ||
        typeof payload.summary !== 'string'
      )
        return null;
      return {
        version: 1,
        kind: 'agent_review',
        strategyId: payload.strategyId,
        strategyLabel: payload.strategyLabel.slice(0, 300),
        postId: payload.postId,
        platform: payload.platform,
        autoPublishEnabled: payload.autoPublishEnabled,
        approvalStreak: payload.approvalStreak,
        expired: payload.expired,
        summary: payload.summary.slice(0, 2000),
        ...(readNotificationSourcePath(payload.sourcePath)
          ? { sourcePath: readNotificationSourcePath(payload.sourcePath) }
          : {}),
      };
    }

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
      ...(typeof payload.summary === 'string'
        ? { summary: payload.summary.slice(0, 2000) }
        : {}),
      ...(readNotificationSourcePath(payload.sourcePath)
        ? { sourcePath: readNotificationSourcePath(payload.sourcePath) }
        : {}),
      ...(typeof payload.strategyId === 'string'
        ? { strategyId: payload.strategyId }
        : {}),
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
    payload: WorkflowStatusNotificationPayload | AgentReviewNotificationPayload,
    isAgentRun: boolean,
  ): {
    html: string;
    subject: string;
    text: string;
  } {
    if ('kind' in payload) {
      const subject = `${payload.expired ? 'Agent review expired' : 'Agent review updated'}: ${payload.strategyLabel}`;
      const href = this.agentReportHref(
        this.configService?.get('GENFEEDAI_APP_URL'),
        payload.sourcePath,
      );
      return {
        subject,
        text: [subject, payload.summary, href].filter(Boolean).join('\n'),
        html: buildSystemEmailHtml({
          title: subject,
          bodyHtml: `<p>${escapeSystemEmailHtml(payload.summary)}</p>${href ? `<p><a href="${escapeSystemEmailHtml(href)}">View agent</a></p>` : ''}`,
        }),
      };
    }
    const isFailure = payload.status === 'failed';
    const subject = isFailure
      ? `${isAgentRun ? 'Agent run' : 'Workflow'} failed: ${payload.workflowLabel}`
      : `${isAgentRun ? 'Agent run' : 'Workflow'} completed: ${payload.workflowLabel}`;
    if (isAgentRun && isFailure && payload.failure) {
      const { title, summary, recovery } = payload.failure;
      const href = this.agentReportHref(
        this.configService?.get('GENFEEDAI_APP_URL'),
        payload.sourcePath,
      );
      const text = [subject, title, summary, recovery, payload.summary, href]
        .filter(Boolean)
        .join('\n');
      const bodyHtml = [title, summary, recovery, payload.summary]
        .filter((value): value is string => typeof value === 'string')
        .map((value) => `<p>${escapeSystemEmailHtml(value)}</p>`)
        .join('');
      return {
        html: buildSystemEmailHtml({
          bodyHtml: `${bodyHtml}${href ? `<p><a href="${escapeSystemEmailHtml(href)}">View agent</a></p>` : ''}`,
          title: subject,
        }),
        subject,
        text,
      };
    }
    if (isAgentRun && !isFailure) {
      const baseUrl = this.configService?.get('GENFEEDAI_APP_URL');
      const href = this.agentReportHref(baseUrl, payload.sourcePath);
      const summary = payload.summary ?? 'Your agent run completed.';
      return {
        subject,
        text: [subject, summary, href].filter(Boolean).join('\n'),
        html: buildSystemEmailHtml({
          title: subject,
          bodyHtml: `<p>${escapeSystemEmailHtml(summary)}</p>${href ? `<p><a href="${escapeSystemEmailHtml(href)}">View agent</a></p>` : ''}`,
        }),
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
