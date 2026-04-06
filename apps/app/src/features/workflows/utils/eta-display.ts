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

export function getExecutionEtaDisplayState(params: {
  eta?: ExecutionEtaMetadata;
  status: string;
  durationMs?: number;
}): ExecutionEtaDisplayState {
  const { eta, status, durationMs } = params;
  const normalizedStatus = status.toLowerCase();
  const actualDurationMs = eta?.actualDurationMs ?? durationMs;
  const etaVisible = shouldDisplayEta(eta);
  const estimatedDurationMs = eta?.estimatedDurationMs;
  const remainingDurationMs = eta?.remainingDurationMs;
  const confidence = eta?.etaConfidence;
  const elapsedMs = getElapsedMs(eta?.startedAt);

  let etaLabel: string | null = null;
  if (
    normalizedStatus !== 'completed' &&
    normalizedStatus !== 'failed' &&
    etaVisible &&
    estimatedDurationMs
  ) {
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
      normalizedStatus !== 'completed' &&
      normalizedStatus !== 'failed' &&
      (remainingDurationMs ?? estimatedDurationMs ?? 0) >= 60_000
        ? 'You can keep working. We’ll notify you when it’s ready.'
        : null,
  };
}
