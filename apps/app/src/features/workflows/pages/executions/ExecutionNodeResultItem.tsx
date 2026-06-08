'use client';

import { ButtonVariant } from '@genfeedai/enums';
import { Pre } from '@genfeedai/ui';
import { Button } from '@ui/primitives/button';
import { ClientFormattedDate } from '@/components/ui/client-formatted-date';
import {
  getStatusBorderColor,
  getStatusIcon,
} from '@/features/workflows/utils/status-helpers';

type NodeResult = {
  nodeId: string;
  nodeLabel: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  error?: string;
  output?: Record<string, unknown>;
  startedAt: string;
  completedAt?: string;
  retryCount: number;
  creditsUsed: number;
};

type Props = {
  result: NodeResult;
  isExpanded: boolean;
  onToggle: (nodeId: string) => void;
};

export default function ExecutionNodeResultItem({
  result,
  isExpanded,
  onToggle,
}: Props) {
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
            {result.creditsUsed} credits
          </span>
          {result.retryCount > 0 && (
            <span className="text-yellow-600">{result.retryCount} retries</span>
          )}
          <span>{isExpanded ? '▼' : '▶'}</span>
        </div>
      </Button>

      {isExpanded && (
        <div className="border-t border-white/[0.08] bg-background/50 px-4 py-3">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Started:</span>{' '}
              <ClientFormattedDate value={result.startedAt} />
            </div>
            {result.completedAt && (
              <div>
                <span className="text-muted-foreground">Completed:</span>{' '}
                <ClientFormattedDate value={result.completedAt} />
              </div>
            )}
          </div>
          {result.error && (
            <div className="mt-3 border border-red-200 bg-red-100 p-3 dark:border-red-800 dark:bg-red-900">
              <div className="mb-1 text-sm font-medium text-red-800 dark:text-red-200">
                Error
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
                Output
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
