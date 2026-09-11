import { AGENT_CONVERSATION_WORKFLOW_IDS } from '@api/collections/workflows/services/agent-runtime-workflow-definitions';
import {
  getSystemWorkflowMetadata,
  isHiddenSystemWorkflowMetadata,
} from '@api/collections/workflows/system-workflow.contract';
import type { RecordWorkflowOutcomeInput } from '@api/services/notifications/workflow-notifications/workflow-notification-outbox.service';
import type { FormattedAgentError } from '@genfeedai/agent/server';

export type WorkflowExecutionCompletionRow = {
  estimatedDurationMs: number | null;
  organizationId: string;
  startedAt: Date | null;
  trigger: string | null;
  workflowId: string;
  userId: string;
  workflow: {
    label: string | null;
    metadata: unknown;
    userId: string;
  };
};

export function suppressInternalEmailOutcomeNotification(
  metadata: unknown,
): boolean {
  if (!isHiddenSystemWorkflowMetadata(metadata)) return false;
  const canonicalId = getSystemWorkflowMetadata(metadata)?.canonicalId;
  return (
    canonicalId?.startsWith('lifecycle-email.') === true ||
    canonicalId?.startsWith('email-product-signals.') === true
  );
}

/**
 * Hidden system workflows (agent turns, knowledge ingest, internal jobs)
 * must not fan out "Workflow completed". The conversation or the job's own
 * UI already shows the result. Agent-run failures still notify.
 */
export function suppressWorkflowOutcomeNotification(
  metadata: unknown,
  isFailed: boolean,
): boolean {
  if (suppressInternalEmailOutcomeNotification(metadata)) {
    return true;
  }
  return !isFailed && isHiddenSystemWorkflowMetadata(metadata);
}

export function buildWorkflowOutcomeInput(
  execution: WorkflowExecutionCompletionRow,
  executionId: string,
  completedAt: Date,
  failure: FormattedAgentError | null,
  error?: string,
): RecordWorkflowOutcomeInput {
  return {
    actorUserId: execution.userId,
    failure,
    isAgentRun:
      isHiddenSystemWorkflowMetadata(execution.workflow.metadata) &&
      AGENT_CONVERSATION_WORKFLOW_IDS.includes(
        getSystemWorkflowMetadata(execution.workflow.metadata)?.canonicalId ??
          '',
      ),
    error: error ?? null,
    executionId,
    occurredAt: completedAt,
    organizationId: execution.organizationId,
    status: error ? 'failed' : 'completed',
    trigger: execution.trigger,
    workflowId: execution.workflowId,
    workflowLabel: execution.workflow.label ?? 'Untitled workflow',
    workflowOwnerUserId: isHiddenSystemWorkflowMetadata(
      execution.workflow.metadata,
    )
      ? execution.userId
      : execution.workflow.userId,
  };
}
