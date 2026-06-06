'use client';

import type { WorkflowExecutionStatus } from '@genfeedai/enums';
import { ClientFormattedDate } from '@/components/ui/client-formatted-date';
import type { ExecutionEtaDisplayState } from '@/features/workflows/utils/eta-display';
import { getStatusIcon } from '@/features/workflows/utils/status-helpers';

type Props = {
  status: WorkflowExecutionStatus;
  startedAt: Date;
  duration: number | null;
  totalCreditsUsed: number;
  etaDisplay: ExecutionEtaDisplayState;
};

export default function ExecutionSummaryBar({
  status,
  startedAt,
  duration,
  totalCreditsUsed,
  etaDisplay,
}: Props) {
  return (
    <div className="border-b border-white/[0.08] bg-card/50 px-6 py-4">
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
          {etaDisplay.elapsedLabel && status !== 'completed' && (
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
          <div className="text-sm text-muted-foreground">Credits Used</div>
          <div className="font-semibold">{totalCreditsUsed}</div>
        </div>
      </div>
    </div>
  );
}
