import type { ExecutionResult } from '@/features/workflows/services/workflow-api';

/**
 * Prefer the included workflow label, then a catalog lookup, then a stable
 * untitled fallback. Never surface a raw workflow id as the primary title.
 */
export function getWorkflowLabel(
  execution: Pick<ExecutionResult, 'workflow' | 'workflowId'>,
  labelsById?: ReadonlyMap<string, string>,
): string {
  const included =
    typeof execution.workflow === 'object' && execution.workflow !== null
      ? execution.workflow.label?.trim()
      : undefined;
  if (included) {
    return included;
  }

  const catalog = labelsById?.get(execution.workflowId)?.trim();
  if (catalog) {
    return catalog;
  }

  return 'Untitled workflow';
}
