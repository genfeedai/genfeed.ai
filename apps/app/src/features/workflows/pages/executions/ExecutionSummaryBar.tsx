'use client';

import { WorkflowExecutionStatus } from '@genfeedai/contracts';
import type { WorkflowAccounting } from '@genfeedai/contracts/interfaces';
import { useTranslations } from 'next-intl';
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
  const translate = useTranslations('common.automation.workflows.executions');
  return (
    <div className="border-b border-border bg-card/50 px-6 py-4">
      <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-2 xl:grid-cols-5">
        <div>
          <div className="text-sm text-muted-foreground">
            {translate('accounting.status')}
          </div>
          <div className="flex items-center gap-1 font-semibold">
            {getStatusIcon(status)} {status}
          </div>
        </div>
        <div>
          <div className="text-sm text-muted-foreground">
            {translate('accounting.phase')}
          </div>
          <div className="font-semibold">
            {etaDisplay.phaseLabel ?? translate('accounting.queued')}
          </div>
        </div>
        <div>
          <div className="text-sm text-muted-foreground">
            {translate('accounting.started')}
          </div>
          <div className="font-semibold">
            <ClientFormattedDate value={startedAt} />
          </div>
        </div>
        <div>
          <div className="text-sm text-muted-foreground">
            {translate('accounting.timing')}
          </div>
          <div className="font-semibold">
            {etaDisplay.actualDurationLabel ??
              (duration !== null
                ? `${duration}s`
                : translate('accounting.inProgress'))}
          </div>
          {etaDisplay.elapsedLabel &&
            status !== WorkflowExecutionStatus.COMPLETED && (
              <div className="text-xs text-muted-foreground">
                {translate('accounting.elapsed', {
                  value: etaDisplay.elapsedLabel,
                })}
              </div>
            )}
        </div>
        <div>
          <div className="text-sm text-muted-foreground">
            {translate('accounting.eTA')}
          </div>
          <div className="font-semibold">{etaDisplay.etaLabel ?? ':'}</div>
          {etaDisplay.reassuranceLabel && (
            <div className="text-xs text-muted-foreground">
              {etaDisplay.reassuranceLabel}
            </div>
          )}
        </div>
        <div>
          <div className="text-sm text-muted-foreground">
            {translate('accounting.actualCreditsLabel')}
          </div>
          <div className="font-semibold">
            {accounting?.actualCredits ?? translate('accounting.unavailable')}
          </div>
          <div className="text-xs text-muted-foreground">
            {translate('accounting.estimated')}{' '}
            {accounting?.estimatedCredits ??
              translate('accounting.unavailable')}
          </div>
          <div className="text-xs text-muted-foreground">
            {translate('accounting.variance')}{' '}
            {accounting?.varianceCredits ?? translate('accounting.unavailable')}
          </div>
          <div className="text-xs text-muted-foreground">
            {translate('accounting.providercostUSD')}{' '}
            {accounting?.actualProviderCostMicros == null
              ? translate('accounting.unavailable')
              : `$${(accounting.actualProviderCostMicros / 1_000_000).toFixed(6)}`}
          </div>
          <div className="text-xs text-muted-foreground">
            {translate('accounting.estimatedprovidercostUSD')}{' '}
            {accounting?.estimatedProviderCostMicros == null
              ? translate('accounting.unavailable')
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
              {translate('accounting.knownsubtotal')}{' '}
              {accounting.knownActualCredits}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
