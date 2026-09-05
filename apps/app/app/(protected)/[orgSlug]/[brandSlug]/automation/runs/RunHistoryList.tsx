'use client';

import type { IWorkflowExecution } from '@genfeedai/contracts/interfaces';
import CardEmpty from '@ui/card/empty/CardEmpty';
import WorkflowExecutionCard from './WorkflowExecutionCard';

interface RunHistoryListProps {
  executions: IWorkflowExecution[];
  isLoading: boolean;
  onClearFilter?: () => void;
}

export default function RunHistoryList({
  executions,
  isLoading,
  onClearFilter,
}: RunHistoryListProps) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Recent Runs
      </h2>

      {isLoading && executions.length === 0 ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }, (_, index) => index + 1).map((slot) => (
            <div
              key={`skeleton-${slot}`}
              className="gen-card h-20 animate-pulse bg-muted"
            />
          ))}
        </div>
      ) : executions.length === 0 ? (
        <CardEmpty
          label={
            onClearFilter
              ? 'No workflow executions match your search.'
              : 'No workflow executions yet.'
          }
          action={
            onClearFilter
              ? { label: 'Clear search', onClick: onClearFilter }
              : undefined
          }
        />
      ) : (
        <div className="flex flex-col gap-2">
          {executions.map((execution) => (
            <WorkflowExecutionCard execution={execution} key={execution.id} />
          ))}
        </div>
      )}
    </div>
  );
}
