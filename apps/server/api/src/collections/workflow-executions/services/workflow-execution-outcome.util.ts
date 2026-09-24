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
  executionResult?: unknown,
): boolean {
  if (suppressInternalEmailOutcomeNotification(metadata)) {
    return true;
  }
  const result =
    executionResult && typeof executionResult === 'object'
      ? (executionResult as Record<string, unknown>)
      : {};
  const runtime =
    result.metadata && typeof result.metadata === 'object'
      ? (result.metadata as Record<string, unknown>)
      : {};
  const proactive =
    runtime.source === 'proactive' &&
    runtime.canonicalId === 'agent.turn.execute' &&
    typeof runtime.strategyId === 'string';
  return !isFailed && !proactive && isHiddenSystemWorkflowMetadata(metadata);
}

export function buildWorkflowOutcomeInput(
  execution: WorkflowExecutionCompletionRow,
  executionId: string,
  completedAt: Date,
  failure: FormattedAgentError | null,
  error?: string,
  result?: unknown,
): RecordWorkflowOutcomeInput {
  const root =
    result && typeof result === 'object'
      ? (result as Record<string, unknown>)
      : {};
  const metadata =
    root.metadata && typeof root.metadata === 'object'
      ? (root.metadata as Record<string, unknown>)
      : {};
  const isProactive =
    metadata.source === 'proactive' &&
    metadata.canonicalId === 'agent.turn.execute' &&
    typeof metadata.strategyId === 'string';
  const report =
    isProactive &&
    metadata.agentReport &&
    typeof metadata.agentReport === 'object'
      ? (metadata.agentReport as Record<string, unknown>)
      : {};
  return {
    actorUserId: execution.userId,
    ...(typeof report.summary === 'string' ? { summary: report.summary } : {}),
    ...(typeof report.sourcePath === 'string'
      ? { sourcePath: report.sourcePath }
      : {}),
    ...(typeof report.strategyId === 'string'
      ? { strategyId: report.strategyId }
      : {}),
    failure,
    isAgentRun:
      isProactive ||
      (isHiddenSystemWorkflowMetadata(execution.workflow.metadata) &&
        AGENT_CONVERSATION_WORKFLOW_IDS.includes(
          getSystemWorkflowMetadata(execution.workflow.metadata)?.canonicalId ??
            '',
        )),
    error: error ?? null,
    executionId,
    occurredAt: completedAt,
    organizationId: execution.organizationId,
    status: error ? 'failed' : 'completed',
    trigger: execution.trigger,
    workflowId: execution.workflowId,
    workflowLabel:
      typeof report.label === 'string'
        ? report.label
        : (execution.workflow.label ?? 'Untitled workflow'),
    workflowOwnerUserId: isHiddenSystemWorkflowMetadata(
      execution.workflow.metadata,
    )
      ? execution.userId
      : execution.workflow.userId,
  };
}
