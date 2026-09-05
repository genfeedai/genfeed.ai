'use client';

import { WorkflowExecutionStatus } from '@genfeedai/contracts';
import type { WorkflowAccounting } from '@genfeedai/contracts/interfaces';
import { ClientFormattedDate } from '@/components/ui/client-formatted-date';
import type { ExecutionEtaDisplayState } from '@/features/workflows/utils/eta-display';
import { getStatusIcon } from '@/features/workflows/utils/status-helpers';

type Props = {
  accounting?: WorkflowAccounting | null;
  status: WorkflowExecutionStatus;
  startedAt: Date;
  duration: number | null;
  totalCreditsUsed: number;
  etaDisplay: ExecutionEtaDisplayState;
};

export default function ExecutionSummaryBar({
  accounting,
  status,
  startedAt,
  duration,
  etaDisplay,
}: Props) {
  return (
    <div className="border-b border-border bg-card/50 px-6 py-4">
      <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-2 xl:grid-cols-5">
        <div>
          <div className="text-sm text-muted-foreground">Status</div>
          <div className="flex items-center gap-1 font-semibold">
            {getStatusIcon(status)} {status}
          </div>
        </div>
        <div>
          <div className="text-sm text-muted-foreground">Phase</div>
          <div className="font-semibold">
            {etaDisplay.phaseLabel ?? 'Queued'}
          </div>
        </div>
        <div>
          <div className="text-sm text-muted-foreground">Started</div>
          <div className="font-semibold">
            <ClientFormattedDate value={startedAt} />
          </div>
        </div>
        <div>
          <div className="text-sm text-muted-foreground">Timing</div>
          <div className="font-semibold">
            {etaDisplay.actualDurationLabel ??
              (duration !== null ? `${duration}s` : 'In progress')}
          </div>
          {etaDisplay.elapsedLabel &&
            status !== WorkflowExecutionStatus.COMPLETED && (
              <div className="text-xs text-muted-foreground">
                Elapsed {etaDisplay.elapsedLabel}
              </div>
            )}
        </div>
        <div>
          <div className="text-sm text-muted-foreground">ETA</div>
          <div className="font-semibold">{etaDisplay.etaLabel ?? ':'}</div>
          {etaDisplay.reassuranceLabel && (
            <div className="text-xs text-muted-foreground">
              {etaDisplay.reassuranceLabel}
            </div>
          )}
        </div>
        <div>
          <div className="text-sm text-muted-foreground">Actual credits</div>
          <div className="font-semibold">
            {accounting?.actualCredits ?? 'Unavailable'}
          </div>
          <div className="text-xs text-muted-foreground">
            Estimated: {accounting?.estimatedCredits ?? 'Unavailable'}
          </div>
          <div className="text-xs text-muted-foreground">
            Variance: {accounting?.varianceCredits ?? 'Unavailable'}
          </div>
          <div className="text-xs text-muted-foreground">
            Provider cost (USD):{' '}
            {accounting?.actualProviderCostMicros == null
              ? 'Unavailable'
              : `$${(accounting.actualProviderCostMicros / 1_000_000).toFixed(6)}`}
          </div>
          <div className="text-xs text-muted-foreground">
            Estimated provider cost (USD):{' '}
            {accounting?.estimatedProviderCostMicros == null
              ? 'Unavailable'
              : `$${(accounting.estimatedProviderCostMicros / 1_000_000).toFixed(6)}`}
          </div>
          {accounting?.actualProviderCostMicros === null && (
            <div className="text-xs text-muted-foreground">
              Known provider subtotal (USD): $
              {(accounting.knownProviderCostMicros / 1_000_000).toFixed(6)}
            </div>
          )}
          {accounting?.actualCredits === null && (
            <div className="text-xs text-muted-foreground">
              Known subtotal: {accounting.knownActualCredits}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
