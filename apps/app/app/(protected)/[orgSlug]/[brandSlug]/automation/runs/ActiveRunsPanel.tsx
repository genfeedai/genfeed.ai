'use client';

import type { IWorkflowExecution } from '@genfeedai/contracts/interfaces';
import Badge from '@ui/display/badge/Badge';
import { useTranslations } from 'next-intl';
import WorkflowExecutionCard from './WorkflowExecutionCard';

interface ActiveRunsPanelProps {
  executions: IWorkflowExecution[];
  onCancel?: (id: string) => void;
}

export default function ActiveRunsPanel({
  executions,
  onCancel,
}: ActiveRunsPanelProps) {
  const translate = useTranslations('pages.workflows.status');

  if (executions.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Badge status="running">{translate('running')}</Badge>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {translate('activeRuns')}
        </h2>
        <span className="text-xs text-muted-foreground">
          ({executions.length})
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {executions.map((execution) => (
          <WorkflowExecutionCard
            execution={execution}
            key={execution.id}
            onCancel={onCancel}
          />
        ))}
      </div>
    </div>
  );
}
