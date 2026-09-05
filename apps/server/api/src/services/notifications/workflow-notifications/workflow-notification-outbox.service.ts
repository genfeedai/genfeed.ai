import {
  AGENT_STATUS_NOTIFICATION_TOPIC,
  EMAIL_NOTIFICATION_CHANNEL,
  NOTIFICATION_DELIVERY_STATUS,
  RESEND_NOTIFICATION_PROVIDER,
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
    const isAgentFailure =
      input.isAgentRun === true && input.status === 'failed';
    const classifiedFailure =
      input.failure ?? (isAgentFailure ? formatAgentError(input.error) : null);
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
          error: failure ? null : (input.error?.slice(0, 2000) ?? null),
          failure,
          executionId: input.executionId,
          status: input.status,
          trigger: input.trigger ?? null,
          version: 1,
          workflowId: input.workflowId,
          workflowLabel: input.workflowLabel.slice(0, 300),
        },
        sourceId: input.executionId,
        sourceType: isAgentFailure ? 'agent_run' : 'workflow_execution',
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
        topic: isAgentFailure
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
