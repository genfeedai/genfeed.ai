'use client';

import {
  ButtonVariant,
  formatEnumLabel,
  WorkflowExecutionStatus,
} from '@genfeedai/contracts';
import { getWorkflowLabel } from '@genfeedai/helpers/automation/workflow-execution.helper';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import InsetSurface from '@ui/display/inset-surface/InsetSurface';
import { Button } from '@ui/primitives/button';
import { ClientFormattedDate } from '@/components/ui/client-formatted-date';
import type {
  BatchExecutionSummary,
  WorkflowSummary,
} from '@/features/workflows/services/workflow-api';

type Props = {
  recentExecutions: BatchExecutionSummary[];
  workflowsById: Map<string, WorkflowSummary>;
  onOpenRecentExecution: (executionId: string) => void;
};

function getStatusClasses(status: WorkflowExecutionStatus): string {
  switch (status) {
    case WorkflowExecutionStatus.COMPLETED:
      return 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300';
    case WorkflowExecutionStatus.RUNNING:
      return 'border-blue-500/30 bg-blue-500/15 text-blue-300';
    case WorkflowExecutionStatus.FAILED:
      return 'border-red-500/30 bg-red-500/15 text-red-300';
    default:
      return 'border-border-strong bg-muted/50 text-muted-foreground';
  }
}

function getProgressPercent(execution: BatchExecutionSummary): number {
  if (execution.totalCount <= 0) {
    return 0;
  }
  return Math.round(
    ((execution.completedCount + execution.failedCount) /
      execution.totalCount) *
      100,
  );
}

export default function BatchHistoryList({
  recentExecutions,
  workflowsById,
  onOpenRecentExecution,
}: Props) {
  return (
    <Card bodyClassName="gap-0 p-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-foreground">
          Recent executions
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Reopen a batch, resume progress, or inspect completed results.
        </p>
      </div>

      {recentExecutions.length === 0 ? (
        <InsetSurface
          className="border-dashed bg-background/40 px-4 py-8 text-center text-sm text-muted-foreground"
          tone="default"
        >
          No recent batch executions yet.
        </InsetSurface>
      ) : (
        <div className="divide-y divide-border/80">
          {recentExecutions.map((execution) => (
            <Button
              key={execution.id}
              variant={ButtonVariant.UNSTYLED}
              onClick={() => void onOpenRecentExecution(execution.id)}
              className="w-full py-4 text-left transition hover:bg-foreground/[0.03]"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {getWorkflowLabel(
                      workflowsById.get(execution.workflowId)?.label,
                    )}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    <ClientFormattedDate
                      fallback="Unknown start time"
                      value={execution.createdAt}
                    />
                  </p>
                </div>
                <Badge
                  className={getStatusClasses(execution.status)}
                  variant="ghost"
                >
                  {formatEnumLabel(execution.status)}
                </Badge>
              </div>
              <div className="mt-4">
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-[width]"
                    style={{ width: `${getProgressPercent(execution)}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {execution.completedCount + execution.failedCount} /{' '}
                  {execution.totalCount} processed
                </p>
              </div>
            </Button>
          ))}
        </div>
      )}
    </Card>
  );
}
