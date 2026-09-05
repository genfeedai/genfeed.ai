'use client';

import type { WorkflowExecutionStatus } from '@genfeedai/contracts';
import { ButtonVariant } from '@genfeedai/contracts';
import type { WorkflowNodeAccounting } from '@genfeedai/contracts/interfaces';
import { Pre } from '@genfeedai/ui';
import { Button } from '@ui/primitives/button';
import { useTranslations } from 'next-intl';
import { ClientFormattedDate } from '@/components/ui/client-formatted-date';
import {
  getStatusBorderColor,
  getStatusIcon,
} from '@/features/workflows/utils/status-helpers';

type NodeResult = {
  nodeId: string;
  nodeLabel: string;
  status: WorkflowExecutionStatus;
  error?: string;
  output?: Record<string, unknown>;
  startedAt: string;
  completedAt?: string;
  retryCount: number;
  creditsUsed: number;
};

type Props = {
  accounting?: WorkflowNodeAccounting;
  result: NodeResult;
  isExpanded: boolean;
  onToggle: (nodeId: string) => void;
};

export default function ExecutionNodeResultItem({
  accounting,
  result,
  isExpanded,
  onToggle,
}: Props) {
  const translate = useTranslations('common.automation.workflows.executions');
  return (
    <div
      className={`overflow-hidden border ${getStatusBorderColor(result.status)}`}
    >
      <Button
        variant={ButtonVariant.UNSTYLED}
        withWrapper={false}
        onClick={() => onToggle(result.nodeId)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-3">
          <span>{getStatusIcon(result.status)}</span>
          <span className="font-medium">{result.nodeLabel}</span>
          <span className="text-sm text-muted-foreground">
            ({result.nodeId})
          </span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-muted-foreground">
            {translate('accounting.creditAmount', {
              value:
                accounting?.actualCredits ??
                translate('accounting.unavailable'),
            })}
          </span>
          {result.retryCount > 0 && (
            <span className="text-yellow-600">
              {translate('accounting.retries', { count: result.retryCount })}
            </span>
          )}
          <span>{isExpanded ? '▼' : '▶'}</span>
        </div>
      </Button>

      {isExpanded && (
        <div className="border-t border-border bg-background/50 px-4 py-3">
          {accounting && (
            <div className="mb-3 space-y-1 text-sm">
              <div>
                {translate('accounting.model')}{' '}
                {accounting.model ?? translate('accounting.unavailable')} ·{' '}
                {translate('accounting.provider')}{' '}
                {accounting.provider ?? translate('accounting.unavailable')}
              </div>
              <div>
                {translate('accounting.estimatedcredits')}{' '}
                {accounting.estimatedCredits ??
                  translate('accounting.unavailable')}{' '}
                · {translate('accounting.actualcredits')}{' '}
                {accounting.actualCredits ??
                  translate('accounting.unavailable')}{' '}
                · {translate('accounting.variance')}{' '}
                {accounting.varianceCredits ??
                  translate('accounting.unavailable')}
              </div>
              <div>
                {translate('accounting.refundedcredits')}{' '}
                {accounting.refundedCredits} ·{' '}
                {translate('accounting.reservedcredits')}{' '}
                {accounting.reservedCredits}
              </div>
              <div>
                {translate('accounting.providercostUSD')}{' '}
                {accounting.actualProviderCostMicros === null
                  ? translate('accounting.unavailable')
                  : `$${(accounting.actualProviderCostMicros / 1_000_000).toFixed(6)}`}
              </div>
              {accounting.providerBreakdown?.map((cost) => (
                <div key={`${cost.provider}:${cost.model}`}>
                  {cost.provider} / {cost.model}:{' '}
                  {cost.actualProviderCostMicros === null
                    ? translate('accounting.unavailable')
                    : `$${(cost.actualProviderCostMicros / 1_000_000).toFixed(6)}`}
                </div>
              ))}
              <div>
                {translate('accounting.accounting')} {accounting.state}
              </div>
              {accounting.unresolvedReasons.length > 0 && (
                <div>
                  {accounting.unresolvedReasons
                    .map((reason) => reason.replaceAll('_', ' '))
                    .join(' · ')}
                </div>
              )}
            </div>
          )}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">
                {translate('accounting.started')}
              </span>{' '}
              <ClientFormattedDate value={result.startedAt} />
            </div>
            {result.completedAt && (
              <div>
                <span className="text-muted-foreground">
                  {translate('accounting.completed')}
                </span>{' '}
                <ClientFormattedDate value={result.completedAt} />
              </div>
            )}
          </div>
          {result.error && (
            <div className="mt-3 border border-red-200 bg-red-100 p-3 dark:border-red-800 dark:bg-red-900">
              <div className="mb-1 text-sm font-medium text-red-800 dark:text-red-200">
                {translate('accounting.error')}
              </div>
              <Pre
                variant="ghost"
                size="md"
                className="text-red-700 dark:text-red-300"
              >
                {result.error}
              </Pre>
            </div>
          )}
          {result.output && (
            <div className="mt-3">
              <div className="mb-1 text-sm font-medium text-muted-foreground">
                {translate('accounting.output')}
              </div>
              <Pre size="md" className="text-sm">
                {JSON.stringify(result.output, null, 2)}
              </Pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
