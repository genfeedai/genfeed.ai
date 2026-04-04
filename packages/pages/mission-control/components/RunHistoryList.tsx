'use client';

import type { IAgentRun } from '@cloud/interfaces';
import AgentRunCard from '@pages/mission-control/components/AgentRunCard';

interface RunHistoryListProps {
  runs: IAgentRun[];
  isLoading: boolean;
}

export default function RunHistoryList({
  runs,
  isLoading,
}: RunHistoryListProps) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Recent Runs
      </h2>

      {isLoading && runs.length === 0 ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={`skeleton-${i}`}
              className="gen-card h-20 animate-pulse bg-muted"
            />
          ))}
        </div>
      ) : runs.length === 0 ? (
        <div className="gen-card flex items-center justify-center p-8 text-sm text-muted-foreground">
          No runs yet. Trigger a proactive agent or start a manual run.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {runs.map((run) => (
            <AgentRunCard key={run.id} run={run} />
          ))}
        </div>
      )}
    </div>
  );
}
