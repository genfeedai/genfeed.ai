import type { WorkflowExecutionLabelSource } from '@genfeedai/contracts/interfaces';
import { getMetadataRecord } from '@genfeedai/contracts/interfaces';

export function getWorkflowLabel(
  label: unknown,
  fallback = 'Untitled workflow',
): string {
  return typeof label === 'string' && label.trim() ? label.trim() : fallback;
}

export function getWorkflowExecutionLabel(
  execution: WorkflowExecutionLabelSource,
  fallback = 'Untitled workflow',
): string {
  const metadata = getMetadataRecord(execution.result?.metadata);
  if (
    metadata.source === 'proactive' &&
    metadata.canonicalId === 'agent.turn.execute'
  ) {
    return getWorkflowLabel(metadata.label, 'Agent run');
  }
  const workflow =
    typeof execution.workflow === 'object' ? execution.workflow : undefined;
  return getWorkflowLabel(
    workflow?.label,
    getWorkflowLabel(execution.metadata?.label, fallback),
  );
}

export function getLocalDayWindow(now = new Date()): {
  dayStart: string;
  dayEnd: string;
} {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { dayStart: start.toISOString(), dayEnd: end.toISOString() };
}
