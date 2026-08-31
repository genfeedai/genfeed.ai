'use client';

import type { IWorkflowExecution } from '@genfeedai/interfaces';
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@ui/primitives/table';
import { useTranslations } from 'next-intl';
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
  const translate = useTranslations('common.automation.workflowExecutions');

  return (
    <div>
      <h3 className="mb-3 text-sm font-medium text-foreground/70">
        {translate('historyTitle')}
      </h3>
      {isLoading ? (
        <div className="h-12 animate-pulse rounded bg-foreground/5" />
      ) : executions.length === 0 ? (
        <p className="py-8 text-center text-sm text-foreground/40">
          {translate('empty')}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead />
                <TableHead>{translate('columnStatus')}</TableHead>
                <TableHead>{translate('columnCredits')}</TableHead>
                <TableHead>{translate('columnNodes')}</TableHead>
                <TableHead>{translate('columnModel')}</TableHead>
                <TableHead>{translate('columnDuration')}</TableHead>
                <TableHead>{translate('columnStarted')}</TableHead>
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
