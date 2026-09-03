import type { AgentThread } from '@genfeedai/agent/models/agent-chat.model';
import type { AgentSocketConnectionState } from '@genfeedai/agent/stores/agent-chat.store';
import { useAgentChatStore } from '@genfeedai/agent/stores/agent-chat.store';
import { ComponentSize } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import Badge from '@ui/display/badge/Badge';
import Link from 'next/link';
import { type ReactElement, useMemo } from 'react';
import {
  type AgentRunListItem,
  groupAgentRuns,
  projectThreadToRun,
  runStatusLabel,
} from './agent-runs-list.helpers';

export type AgentRunsListProps = {
  getThreadHref?: (thread: AgentThread) => string;
  onNavigate?: (path: string) => void;
  socketConnectionState?: AgentSocketConnectionState;
};

function RunRow({
  run,
  href,
  onNavigate,
}: {
  href: string;
  onNavigate?: (path: string) => void;
  run: AgentRunListItem;
}): ReactElement {
  return (
    <Link
      href={href}
      onClick={(event) => {
        if (!onNavigate) {
          return;
        }
        event.preventDefault();
        onNavigate(href);
      }}
      className="flex items-center justify-between gap-2 rounded border border-transparent px-2 py-1.5 hover:bg-foreground/[0.045]"
    >
      <span className="min-w-0 truncate text-sm text-foreground">
        {run.threadTitle}
      </span>
      <Badge
        size={ComponentSize.SM}
        status={
          run.runtimeState === 'failed' || run.runtimeState === 'interrupted'
            ? 'failed'
            : run.runtimeState === 'awaiting_input' ||
                run.runtimeState === 'awaiting_confirmation'
              ? 'pending_approval'
              : 'running'
        }
      >
        {runStatusLabel(run.runtimeState)}
      </Badge>
    </Link>
  );
}

export function AgentRunsList({
  getThreadHref,
  onNavigate,
  socketConnectionState,
}: AgentRunsListProps): ReactElement {
  const threads = useAgentChatStore((state) => state.threads);
  const isProjectionStale =
    socketConnectionState === 'offline' ||
    socketConnectionState === 'reconnecting';
  const runs = useMemo(
    () =>
      threads
        .map((thread) => projectThreadToRun(thread, { isProjectionStale }))
        .filter((run): run is AgentRunListItem => run !== null),
    [isProjectionStale, threads],
  );
  const groups = useMemo(() => groupAgentRuns(runs), [runs]);

  function resolveHref(run: AgentRunListItem): string {
    const thread = threads.find((item) => item.id === run.threadId);
    const base =
      (thread && getThreadHref?.(thread)) ??
      `${APP_ROUTES.AGENT.ROOT}/${run.threadId}`;
    const queryIndex = run.decisionHref.indexOf('?');
    if (queryIndex === -1 || base.includes('?')) {
      return base;
    }
    return `${base}${run.decisionHref.slice(queryIndex)}`;
  }

  const sections: Array<{ items: AgentRunListItem[]; label: string }> = [
    { items: groups.awaiting, label: 'Needs a decision' },
    { items: groups.working, label: 'Working' },
    { items: groups.failed, label: 'Recently failed' },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="agent-runs-list">
      {isProjectionStale ? (
        <p className="px-3 py-2 text-xs text-warning" role="status">
          Run status may be stale until the connection recovers.
        </p>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {runs.length === 0 ? (
          <p className="px-1 py-6 text-sm text-muted-foreground">
            No active or recently failed runs.
          </p>
        ) : (
          sections.map((section) =>
            section.items.length === 0 ? null : (
              <section key={section.label} className="mt-3">
                <h3 className="px-1 pb-1 text-2xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                  {section.label}
                </h3>
                <div className="space-y-0.5">
                  {section.items.map((run) => (
                    <RunRow
                      key={run.id}
                      href={resolveHref(run)}
                      onNavigate={onNavigate}
                      run={run}
                    />
                  ))}
                </div>
              </section>
            ),
          )
        )}
      </div>
    </div>
  );
}
