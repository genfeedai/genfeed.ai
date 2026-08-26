'use client';

import type { IAgentRun } from '@genfeedai/interfaces';
import Badge from '@ui/display/badge/Badge';
import { useTranslations } from 'next-intl';
import AgentRunCard from './AgentRunCard';

interface ActiveRunsPanelProps {
  runs: IAgentRun[];
  onCancel?: (id: string) => void;
}

export default function ActiveRunsPanel({
  runs,
  onCancel,
}: ActiveRunsPanelProps) {
  const translate = useTranslations('pages.workflows.status');

  if (runs.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Badge status="running">{translate('running')}</Badge>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {translate('activeRuns')}
        </h2>
        <span className="text-xs text-muted-foreground">({runs.length})</span>
      </div>
      <div className="flex flex-col gap-2">
        {runs.map((run) => (
          <AgentRunCard key={run.id} run={run} onCancel={onCancel} />
        ))}
      </div>
    </div>
  );
}
