import { formatAgentError } from '@genfeedai/agent/server';
import { WorkflowExecutionStatus } from '@genfeedai/contracts';

/** Enrich a persisted terminal failure without treating an accepted message as a run. */
export function executionFailureResult(payload: unknown) {
  if (!payload || typeof payload !== 'object') return {};
  if (
    !('status' in payload) ||
    String(payload.status).toUpperCase() !== WorkflowExecutionStatus.FAILED
  )
    return {};
  const raw =
    'error' in payload && typeof payload.error === 'string'
      ? payload.error
      : undefined;
  return {
    isError: true,
    structuredContent: { failure: { ...formatAgentError(raw), detail: null } },
  };
}
