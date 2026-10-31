import { WorkflowExecutionStatus } from '@genfeedai/contracts';
import {
  formatEtaDuration,
  formatEtaRange,
  shouldDisplayEta,
} from '@helpers/generation-eta.helper';
import type { ExecutionEtaMetadata } from '@/features/workflows/services/workflow-api';

export interface ExecutionEtaDisplayState {
  actualDurationLabel: string | null;
  elapsedLabel: string | null;
  etaLabel: string | null;
  phaseLabel: string | null;
  reassuranceLabel: string | null;
}

function getElapsedMs(startedAt?: string): number | null {
  if (!startedAt) {
    return null;
  }

  const startedAtMs = new Date(startedAt).getTime();
  if (Number.isNaN(startedAtMs)) {
    return null;
  }

  return Math.max(0, Date.now() - startedAtMs);
}

/**
 * A settled execution has no ETA left to show — `workflow_executions.status` is
 * Prisma-backed, so these are the SCREAMING_SNAKE wire values. `CANCELLED` is
 * settled too: the run stopped, so any remaining estimate is meaningless.
 *
 * @see .agents/memory/rules/enum_source_of_truth.md
 */
const SETTLED_STATUSES: ReadonlySet<WorkflowExecutionStatus> = new Set([
  WorkflowExecutionStatus.CANCELLED,
  WorkflowExecutionStatus.COMPLETED,
  WorkflowExecutionStatus.FAILED,
]);

export function getExecutionEtaDisplayState(params: {
  eta?: ExecutionEtaMetadata;
  status: WorkflowExecutionStatus;
  durationMs?: number;
}): ExecutionEtaDisplayState {
  const { eta, status, durationMs } = params;
  const isSettled = SETTLED_STATUSES.has(status);
  const actualDurationMs = eta?.actualDurationMs ?? durationMs;
  const etaVisible = shouldDisplayEta(eta);
  const estimatedDurationMs = eta?.estimatedDurationMs;
  const remainingDurationMs = eta?.remainingDurationMs;
  const confidence = eta?.etaConfidence;
  const elapsedMs = getElapsedMs(eta?.startedAt);

  let etaLabel: string | null = null;
  if (!isSettled && etaVisible && estimatedDurationMs) {
    etaLabel =
      confidence === 'low'
        ? `Usually takes ${formatEtaRange(estimatedDurationMs)}`
        : `About ${formatEtaDuration(
            remainingDurationMs ?? estimatedDurationMs,
          )} left`;
  }

  return {
    actualDurationLabel:
      actualDurationMs && actualDurationMs > 0
        ? formatEtaDuration(actualDurationMs)
        : null,
    elapsedLabel:
      elapsedMs && elapsedMs > 0 ? formatEtaDuration(elapsedMs) : null,
    etaLabel,
    phaseLabel: eta?.currentPhase ?? null,
    reassuranceLabel:
      !isSettled && (remainingDurationMs ?? estimatedDurationMs ?? 0) >= 60_000
        ? 'You can keep working. We’ll notify you when it’s ready.'
        : null,
  };
}
