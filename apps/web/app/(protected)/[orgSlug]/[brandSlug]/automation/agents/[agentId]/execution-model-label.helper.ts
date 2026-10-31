import type { IWorkflowExecution } from '@genfeedai/contracts/interfaces';

function getExecutionMetadataString(
  metadata: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = metadata?.[key];
  return typeof value === 'string' && value.trim().length > 0
    ? value
    : undefined;
}

/**
 * Routed-model label for a workflow execution: shows the actual model next
 * to the one requested when a fallback rerouted the call, otherwise just the
 * known model. Used by the merged Activity timeline (#5483).
 */
export function getExecutionModelLabel(execution: IWorkflowExecution): string {
  const actualModel = getExecutionMetadataString(
    execution.metadata,
    'actualModel',
  );
  const requestedModel = getExecutionMetadataString(
    execution.metadata,
    'requestedModel',
  );

  if (actualModel && requestedModel && actualModel !== requestedModel) {
    return `${actualModel} via ${requestedModel}`;
  }

  return actualModel ?? requestedModel ?? 'Untracked';
}
