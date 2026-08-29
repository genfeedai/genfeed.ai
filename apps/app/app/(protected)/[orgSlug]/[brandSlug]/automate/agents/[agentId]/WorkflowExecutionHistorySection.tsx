'use client';

import type { IWorkflowExecution } from '@genfeedai/interfaces';
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@ui/primitives/table';
import WorkflowExecutionRow from './WorkflowExecutionRow';

interface WorkflowExecutionHistorySectionProps {
  executions: IWorkflowExecution[];
  expandedExecutionId: string | null;
  isLoading: boolean;
  onToggleExpand: (executionId: string) => void;
}

export default function WorkflowExecutionHistorySection({
  executions,
  expandedExecutionId,
  isLoading,
  onToggleExpand,
}: WorkflowExecutionHistorySectionProps) {
  return (
    <div>
      <h3 className="mb-3 text-sm font-medium text-foreground/70">
        Workflow execution history
      </h3>
      {isLoading ? (
        <div className="h-12 animate-pulse rounded bg-foreground/5" />
      ) : executions.length === 0 ? (
        <p className="py-8 text-center text-sm text-foreground/40">
          No workflow executions yet
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead />
                <TableHead>Status</TableHead>
                <TableHead>Credits</TableHead>
                <TableHead>Nodes</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Started</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {executions.map((execution) => (
                <WorkflowExecutionRow
                  execution={execution}
                  isExpanded={expandedExecutionId === execution.id}
                  key={execution.id}
                  onToggle={onToggleExpand}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
