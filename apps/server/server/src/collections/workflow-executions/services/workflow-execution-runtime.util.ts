import type { WorkflowNodeResult } from '@server/collections/workflow-executions/schemas/workflow-execution.schema';

export type WorkflowExecutionProgressSnapshot = {
  id: string;
  metadata: Record<string, unknown>;
  progress: number;
};

export type WorkflowExecutionProgressRow = {
  id: string;
  progress: number | null;
};

export type WorkflowExecutionScalarRow = {
  creditsUsed?: number | null;
  durationMs?: number | null;
  estimatedDurationMs?: number | null;
  etaConfidence?: string | null;
  etaCurrentPhase?: string | null;
  etaUpdatedAt?: Date | null;
  failedNodeId?: string | null;
  nodeResults?: unknown;
  progress?: number | null;
  remainingDurationMs?: number | null;
};

export function readRecord(raw: unknown): Record<string, unknown> {
  return raw !== null && typeof raw === 'object' && !Array.isArray(raw)
    ? { ...(raw as Record<string, unknown>) }
    : {};
}

export function readNodeResults(raw: unknown): WorkflowNodeResult[] {
  return Array.isArray(raw)
    ? raw.filter(
        (item): item is WorkflowNodeResult =>
          item !== null && typeof item === 'object' && !Array.isArray(item),
      )
    : [];
}

export function readOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

export function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function composeEtaMetadata(
  row: WorkflowExecutionScalarRow,
  existingEta: Record<string, unknown>,
): Record<string, unknown> {
  return {
    ...existingEta,
    ...(row.etaCurrentPhase ? { currentPhase: row.etaCurrentPhase } : {}),
    ...(readOptionalNumber(row.estimatedDurationMs) !== undefined
      ? { estimatedDurationMs: row.estimatedDurationMs }
      : {}),
    ...(row.etaConfidence ? { etaConfidence: row.etaConfidence } : {}),
    ...(row.etaUpdatedAt
      ? { lastEtaUpdateAt: row.etaUpdatedAt.toISOString() }
      : {}),
    ...(readOptionalNumber(row.remainingDurationMs) !== undefined
      ? { remainingDurationMs: row.remainingDurationMs }
      : {}),
  };
}

export function toWorkflowExecutionProgressSnapshot(
  row: WorkflowExecutionProgressRow | undefined,
): WorkflowExecutionProgressSnapshot | null {
  return row ? { id: row.id, metadata: {}, progress: row.progress ?? 0 } : null;
}
