'use client';

import type { IAgentRun } from '@cloud/interfaces';
import AgentRunCard from '@pages/mission-control/components/AgentRunCard';

interface ActiveRunsPanelProps {
  runs: IAgentRun[];
  onCancel?: (id: string) => void;
}

export default function ActiveRunsPanel({
  runs,
  onCancel,
}: ActiveRunsPanelProps) {
  if (runs.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Active Runs
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
