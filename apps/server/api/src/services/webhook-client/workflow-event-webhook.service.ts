import {
  classifyWorkflowWebhookError,
  createWorkflowWebhookEventId,
  redactWorkflowWebhookText,
  WORKFLOW_WEBHOOK_SCHEMA_VERSION,
  type WorkflowWebhookPayload,
  workflowWebhookPayloadSchema,
} from '@api-types/contracts/workflow-webhook-events.contract';
import {
  WorkflowExecutionStatus,
  WorkflowExecutionTrigger,
} from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';
import {
  WebhookDispatchService,
  WORKFLOW_WEBHOOK_JOB_ID_PREFIX,
} from './webhook-dispatch.service';

export interface WorkflowExecutionWebhookInput {
  completedAt?: Date | string | null;
  creditsUsed?: number | null;
  durationMs?: number | null;
  errorMessage?: string | null;
  executionId: string;
  failedNodeId?: string | null;
  occurredAt?: Date;
  organizationId: string;
  progress?: number | null;
  startedAt?: Date | string | null;
  status: WorkflowExecutionStatus;
  trigger?: string | null;
  workflowId: string;
}

/**
 * Emits `workflow.execution.completed` / `workflow.execution.failed` from the
 * single terminal transition in `WorkflowExecutionsService.completeExecution`.
 * Emission is best-effort: a webhook problem never fails the execution.
 */
@Injectable()
export class WorkflowEventWebhookService {
  private readonly constructorName = 'WorkflowEventWebhookService';

  constructor(
    private readonly logger: LoggerService,
    private readonly webhookDispatchService: WebhookDispatchService,
  ) {}

  async emitExecutionOutcome(
    input: WorkflowExecutionWebhookInput,
  ): Promise<void> {
    try {
      const status = mapToTerminalExecutionStatus(input.status);

      if (!status) {
        return;
      }

      if (!input.organizationId || !input.executionId || !input.workflowId) {
        this.logger.warn(`${this.constructorName} skipped workflow webhook`, {
          hasExecutionId: Boolean(input.executionId),
          hasOrganizationId: Boolean(input.organizationId),
          hasWorkflowId: Boolean(input.workflowId),
        });
        return;
      }

      const occurredAtIso = (input.occurredAt ?? new Date()).toISOString();
      const isFailure = status === WorkflowExecutionStatus.FAILED;
      const event = isFailure
        ? 'workflow.execution.failed'
        : 'workflow.execution.completed';
      const payload: WorkflowWebhookPayload =
        workflowWebhookPayloadSchema.parse({
          event,
          eventId: createWorkflowWebhookEventId({
            event,
            executionId: input.executionId,
            status,
            workflowId: input.workflowId,
          }),
          execution: {
            completedAt: toIsoString(input.completedAt) ?? occurredAtIso,
            creditsUsed: Math.max(0, input.creditsUsed ?? 0),
            durationMs:
              typeof input.durationMs === 'number' && input.durationMs >= 0
                ? Math.round(input.durationMs)
                : null,
            error: isFailure ? buildExecutionError(input.errorMessage) : null,
            failedNodeId: input.failedNodeId ?? null,
            id: input.executionId,
            progress: clampProgress(input.progress, isFailure),
            startedAt: toIsoString(input.startedAt),
            status,
            trigger: readTrigger(input.trigger),
            workflowId: input.workflowId,
          },
          occurredAt: occurredAtIso,
          schemaVersion: WORKFLOW_WEBHOOK_SCHEMA_VERSION,
          timestamp: occurredAtIso,
        });

      await this.webhookDispatchService.dispatch(
        input.organizationId,
        payload,
        {
          jobIdPrefix: WORKFLOW_WEBHOOK_JOB_ID_PREFIX,
          logLabel: `${this.constructorName} workflow`,
        },
      );
    } catch (error: unknown) {
      this.logger.error(
        `${this.constructorName} failed to emit workflow execution event`,
        {
          error: redactWorkflowWebhookText(
            (error as Error)?.message || 'Workflow webhook emission failed',
          ),
          executionId: input.executionId,
          workflowId: input.workflowId,
        },
      );
    }
  }
}

function mapToTerminalExecutionStatus(
  status: WorkflowExecutionStatus,
): WorkflowExecutionStatus.COMPLETED | WorkflowExecutionStatus.FAILED | null {
  if (
    status === WorkflowExecutionStatus.COMPLETED ||
    status === WorkflowExecutionStatus.FAILED
  ) {
    return status;
  }

  return null;
}

function buildExecutionError(errorMessage?: string | null) {
  const message = redactWorkflowWebhookText(
    errorMessage || 'Workflow execution failed',
  );
  const errorClass = classifyWorkflowWebhookError(message);

  return {
    class: errorClass,
    code: errorClass,
    message,
    retryable: false,
  };
}

function clampProgress(
  progress: number | null | undefined,
  isFailure: boolean,
): number {
  if (typeof progress !== 'number' || Number.isNaN(progress)) {
    return isFailure ? 0 : 100;
  }

  return Math.min(100, Math.max(0, Math.round(progress)));
}

function readTrigger(value: unknown): WorkflowExecutionTrigger | null {
  const triggers = Object.values(WorkflowExecutionTrigger);
  return typeof value === 'string' &&
    triggers.includes(value as WorkflowExecutionTrigger)
    ? (value as WorkflowExecutionTrigger)
    : null;
}

function toIsoString(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  if (typeof value === 'string' && value.trim()) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  return null;
}
