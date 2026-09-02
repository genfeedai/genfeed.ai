'use client';

import type { IWorkflowExecution } from '@genfeedai/contracts/interfaces';
import WorkflowExecutionCard from './WorkflowExecutionCard';

interface RunHistoryListProps {
  executions: IWorkflowExecution[];
  isLoading: boolean;
}

export default function RunHistoryList({
  executions,
  isLoading,
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
        <div className="gen-card flex items-center justify-center p-8 text-sm text-muted-foreground">
          No workflow executions yet.
        </div>
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
