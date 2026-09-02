import { getActionDefinition } from '@genfeedai/actions';

export interface DeriveWorkflowActionIdempotencyKeyInput {
  actionId: string;
  executionId?: string;
  nodeId: string;
}

/**
 * Resolves an action's declared idempotency policy and, when required, derives
 * its stable workflow execution/node key.
 */
export function deriveWorkflowActionIdempotencyKey({
  actionId,
  executionId,
  nodeId,
}: DeriveWorkflowActionIdempotencyKeyInput): string | undefined {
  const action = getActionDefinition(actionId);
  if (!action) {
    throw new Error(`Unknown Genfeed action: ${actionId}`);
  }

  if (action.idempotency === 'none') {
    return undefined;
  }

  if (!executionId) {
    throw new Error(
      `Genfeed action ${actionId} requires a durable workflow executionId for run-node idempotency`,
    );
  }

  return `workflow:${executionId}:${nodeId}`;
}
