import type { ExecutionResult } from '@/features/workflows/services/workflow-api';

/**
 * Build the executions-page catalog map without throwing when a list row is
 * missing `label`. A successful catalog fetch must not take the history page
 * down — callers already treat a failed `list()` as an empty catalog.
 */
export function catalogWorkflowLabels(
  workflows: ReadonlyArray<{ id: string; label?: string | null }>,
): Map<string, string> {
  const labels = new Map<string, string>();

  for (const workflow of workflows) {
    const label = workflow.label?.trim();
    if (label) {
      labels.set(workflow.id, label);
    }
  }

  return labels;
}

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
