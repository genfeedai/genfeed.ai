'use client';

import type { IAgentRun } from '@genfeedai/interfaces';
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@ui/primitives/table';
import AgentRunRow from './AgentRunRow';

type AgentRunHistorySectionProps = {
  isRunsLoading: boolean;
  recentRuns: IAgentRun[];
  expandedRunId: string | null;
  onToggleExpand: (runId: string) => void;
};

export default function AgentRunHistorySection({
  isRunsLoading,
  recentRuns,
  expandedRunId,
  onToggleExpand,
}: AgentRunHistorySectionProps) {
  return (
    <div>
      <h3 className="mb-3 text-sm font-medium text-foreground/70">
        Run History (last 20)
      </h3>
      {isRunsLoading ? (
        <div className="space-y-2">
          {[
            'run-history-skeleton-1',
            'run-history-skeleton-2',
            'run-history-skeleton-3',
          ].map((skeletonId) => (
            <div
              key={skeletonId}
              className="h-12 animate-pulse rounded bg-foreground/5"
            />
          ))}
        </div>
      ) : recentRuns.length === 0 ? (
        <p className="py-8 text-center text-sm text-foreground/40">
          No runs yet
        </p>
      ) : (
        <div className="overflow-x-auto">
          <Table className="w-full caption-bottom text-sm">
            <TableHeader>
              <TableRow className="border-b border-white/5">
                <TableHead className="h-12 w-10 px-2 text-left" />
                <TableHead className="h-12 px-4 text-left text-[10px] font-black uppercase tracking-widest text-white/20">
                  Status
                </TableHead>
                <TableHead className="h-12 px-4 text-left text-[10px] font-black uppercase tracking-widest text-white/20">
                  Credits
                </TableHead>
                <TableHead className="h-12 px-4 text-left text-[10px] font-black uppercase tracking-widest text-white/20">
                  Model
                </TableHead>
                <TableHead className="h-12 px-4 text-left text-[10px] font-black uppercase tracking-widest text-white/20">
                  Duration
                </TableHead>
                <TableHead className="h-12 px-4 text-left text-[10px] font-black uppercase tracking-widest text-white/20">
                  Started
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentRuns.map((run) => {
                const isExpanded = expandedRunId === run.id;
                return (
                  <AgentRunRow
                    key={run.id}
                    run={run}
                    isExpanded={isExpanded}
                    onToggle={onToggleExpand}
                  />
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
