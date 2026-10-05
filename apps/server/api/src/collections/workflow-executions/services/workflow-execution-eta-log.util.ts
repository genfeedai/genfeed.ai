import { readOptionalNumber } from '@api/collections/workflow-executions/services/workflow-execution-runtime.util';

interface EtaLogger {
  log(message: string, context?: unknown): void;
}

export function logWorkflowExecutionEtaComparison(
  logger: EtaLogger | undefined,
  executionId: string,
  workflowId: string,
  durationMs: number,
  rawEstimate: unknown,
): void {
  const estimatedDurationMs = readOptionalNumber(rawEstimate);
  if (estimatedDurationMs === undefined) return;
  logger?.log('Workflow execution eta comparison', {
    durationDeltaMs: durationMs - estimatedDurationMs,
    estimatedDurationMs,
    executionId,
    observedDurationMs: durationMs,
    workflowId,
  });
}
