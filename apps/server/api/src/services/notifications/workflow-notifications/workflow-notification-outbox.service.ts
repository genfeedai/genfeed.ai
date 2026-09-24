import {
  AGENT_STATUS_NOTIFICATION_TOPIC,
  type AgentReviewNotificationPayload,
  EMAIL_NOTIFICATION_CHANNEL,
  NOTIFICATION_DELIVERY_STATUS,
  RESEND_NOTIFICATION_PROVIDER,
  readNotificationSourcePath,
  WORKFLOW_STATUS_NOTIFICATION_TOPIC,
  type WorkflowOutcome,
} from '@api/services/notifications/workflow-notifications/workflow-notification.constants';
import { WorkflowNotificationQueueService } from '@api/services/notifications/workflow-notifications/workflow-notification-queue.service';
import {
  type FormattedAgentError,
  formatAgentError,
} from '@genfeedai/agent/server';
import { type Prisma } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

export interface RecordWorkflowOutcomeInput {
  summary?: string;
  sourcePath?: string;
  strategyId?: string;
  failure?: FormattedAgentError | null;
  isAgentRun?: boolean;
  executionId: string;
  workflowId: string;
  workflowLabel: string;
  workflowOwnerUserId: string;
  actorUserId?: string | null;
  organizationId: string;
  status: WorkflowOutcome;
  error?: string | null;
  trigger?: string | null;
  occurredAt: Date;
}

export interface RecordAgentReviewOutcomeInput {
  organizationId: string;
  brandId: string;
  strategyId: string;
  platform: string;
  postId: string;
  userId: string;
  decisionId: string;
  autoPublishEnabled: boolean;
  approvalStreak: number;
  expired?: boolean;
  occurredAt?: Date;
}

/** Persisted inside the caller's review transaction; recovery enqueues only committed deliveries. */
export async function recordAgentReviewOutcome(
  transaction: Prisma.TransactionClient,
  input: RecordAgentReviewOutcomeInput,
): Promise<string | null> {
  const strategy = await transaction.agentStrategy.findFirst({
    where: {
      id: input.strategyId,
      organizationId: input.organizationId,
      brandId: input.brandId,
      isDeleted: false,
    },
    select: {
      label: true,
      organization: { select: { slug: true } },
      brand: { select: { slug: true } },
    },
  });
  if (!strategy) return null;
  const eventKey = input.expired
    ? 'agent.review.expired'
    : 'agent.review.changed';
  const deduplicationKey = `${eventKey}/${input.organizationId}/${input.strategyId}/${encodeURIComponent(input.decisionId)}`;
  const occurredAt = input.occurredAt ?? new Date();
  const payload: AgentReviewNotificationPayload = {
    version: 1,
    kind: 'agent_review',
    strategyId: input.strategyId,
    strategyLabel: strategy.label ?? 'Agent',
    postId: input.postId,
    platform: input.platform,
    autoPublishEnabled: input.autoPublishEnabled,
    approvalStreak: input.approvalStreak,
    expired: input.expired === true,
    summary: input.expired
      ? `The pending ${input.platform} draft expired before approval. It was not published.`
      : `${input.autoPublishEnabled ? 'Auto-publishing enabled' : 'Review required'} for ${input.platform}. Approval streak: ${input.approvalStreak}.`,
    ...(strategy.organization.slug && strategy.brand?.slug
      ? {
          sourcePath: `/${encodeURIComponent(strategy.organization.slug)}/${encodeURIComponent(strategy.brand.slug)}/automation/agents/${encodeURIComponent(input.strategyId)}`,
        }
      : {}),
  };
  const event = await transaction.notificationEvent.upsert({
    where: { deduplicationKey },
    update: {},
    create: {
      actorUserId: input.userId,
      organizationId: input.organizationId,
      deduplicationKey,
      eventKey,
      occurredAt,
      sourceType: 'agent_strategy',
      sourceId: input.strategyId,
      payload: { ...payload },
    },
  });
  const delivery = await transaction.notificationDelivery.upsert({
    where: {
      eventId_userId_channel: {
        eventId: event.id,
        userId: input.userId,
        channel: EMAIL_NOTIFICATION_CHANNEL,
      },
    },
    update: {},
    create: {
      eventId: event.id,
      userId: input.userId,
      organizationId: input.organizationId,
      channel: EMAIL_NOTIFICATION_CHANNEL,
      provider: RESEND_NOTIFICATION_PROVIDER,
      topic: AGENT_STATUS_NOTIFICATION_TOPIC,
      status: NOTIFICATION_DELIVERY_STATUS.PENDING,
      nextAttemptAt: occurredAt,
      idempotencyKey: deduplicationKey,
    },
  });
  return delivery.id;
}

@Injectable()
export class WorkflowNotificationOutboxService {
  private readonly context = {
    service: WorkflowNotificationOutboxService.name,
  };

  constructor(
    private readonly queueService: WorkflowNotificationQueueService,
    private readonly logger: LoggerService,
  ) {}

  async recordWorkflowOutcome(
    transaction: Prisma.TransactionClient,
    input: RecordWorkflowOutcomeInput,
  ): Promise<string> {
    const isAgentRun = input.isAgentRun === true;
    const isAgentFailure =
      input.isAgentRun === true && input.status === 'failed';
    const classifiedFailure = isAgentFailure
      ? (input.failure ?? formatAgentError(input.error))
      : null;
    const failure = classifiedFailure
      ? { ...classifiedFailure, detail: null }
      : null;
    const eventKey = `workflow.execution.${input.status}`;
    const deduplicationKey = `${eventKey}/${input.executionId}`;
    // tenant-scope-ignore: globally unique execution outcome is the idempotency boundary and each created event persists organizationId
    const event = await transaction.notificationEvent.upsert({
      create: {
        actorUserId: input.actorUserId ?? null,
        deduplicationKey,
        eventKey,
        occurredAt: input.occurredAt,
        organizationId: input.organizationId,
        payload: {
          error:
            failure || input.status === 'completed'
              ? null
              : (input.error?.slice(0, 2000) ?? null),
          failure,
          executionId: input.executionId,
          status: input.status,
          trigger: input.trigger ?? null,
          version: 1,
          workflowId: input.workflowId,
          workflowLabel: input.workflowLabel.slice(0, 300),
          ...(input.summary ? { summary: input.summary.slice(0, 2000) } : {}),
          ...(readNotificationSourcePath(input.sourcePath)
            ? { sourcePath: readNotificationSourcePath(input.sourcePath) }
            : {}),
          ...(input.strategyId ? { strategyId: input.strategyId } : {}),
        },
        sourceId: input.executionId,
        sourceType: isAgentRun ? 'agent_run' : 'workflow_execution',
      },
      update: {},
      where: { deduplicationKey },
    });

    // tenant-scope-ignore: event plus recipient plus channel is globally unique and each created delivery persists organizationId
    const delivery = await transaction.notificationDelivery.upsert({
      create: {
        channel: EMAIL_NOTIFICATION_CHANNEL,
        eventId: event.id,
        idempotencyKey: `workflow-status/${input.executionId}/${input.status}`,
        nextAttemptAt: input.occurredAt,
        organizationId: input.organizationId,
        provider: RESEND_NOTIFICATION_PROVIDER,
        status: NOTIFICATION_DELIVERY_STATUS.PENDING,
        topic: isAgentRun
          ? AGENT_STATUS_NOTIFICATION_TOPIC
          : WORKFLOW_STATUS_NOTIFICATION_TOPIC,
        userId: input.workflowOwnerUserId,
      },
      update: {},
      where: {
        eventId_userId_channel: {
          channel: EMAIL_NOTIFICATION_CHANNEL,
          eventId: event.id,
          userId: input.workflowOwnerUserId,
        },
      },
    });

    if (isAgentRun && input.strategyId && input.summary) {
      for (const channel of ['telegram', 'discord']) {
        await transaction.notificationDelivery.upsert({
          where: {
            eventId_userId_channel: {
              eventId: event.id,
              userId: input.workflowOwnerUserId,
              channel,
            },
          },
          update: {},
          create: {
            eventId: event.id,
            userId: input.workflowOwnerUserId,
            organizationId: input.organizationId,
            channel,
            provider: channel,
            topic: AGENT_STATUS_NOTIFICATION_TOPIC,
            status: NOTIFICATION_DELIVERY_STATUS.PENDING,
            nextAttemptAt: input.occurredAt,
            idempotencyKey: `agent-report/${input.executionId}/${input.status}/${channel}`,
          },
        });
      }
    }
    return delivery.id;
  }

  async enqueueAfterCommit(deliveryId: string): Promise<void> {
    try {
      await this.queueService.enqueue(deliveryId);
    } catch (error: unknown) {
      // The database row is the source of truth. The worker recovery sweep
      // re-enqueues pending rows after a Redis or producer outage.
      this.logger.error('Durable notification queue publish failed', error, {
        ...this.context,
        deliveryId,
      });
    }
  }
}
