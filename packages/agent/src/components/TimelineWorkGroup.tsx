import { TimelineWorkEntry } from '@genfeedai/agent/components/TimelineWorkEntry';
import { AgentWorkEventStatus } from '@genfeedai/agent/models/agent-chat.model';
import type { TimelineWorkGroup as TimelineWorkGroupEntry } from '@genfeedai/agent/utils/derive-timeline';
import { formatAgentErrorDetail } from '@genfeedai/agent/utils/format-agent-error.util';
import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import { type ReactElement, useMemo, useState } from 'react';
import {
  HiCheckCircle,
  HiChevronDown,
  HiClock,
  HiExclamationCircle,
} from 'react-icons/hi2';

interface TimelineWorkGroupProps {
  entry: TimelineWorkGroupEntry;
}

export function TimelineWorkGroup({
  entry,
}: TimelineWorkGroupProps): ReactElement {
  const terminalStatus = useMemo(() => {
    if (
      entry.events.some((event) => event.status === AgentWorkEventStatus.FAILED)
    ) {
      return 'failed' as const;
    }
    if (
      entry.events.some(
        (event) => event.status === AgentWorkEventStatus.CANCELLED,
      )
    ) {
      return 'cancelled' as const;
    }
    if (
      entry.events.some(
        (event) => event.status === AgentWorkEventStatus.COMPLETED,
      ) &&
      entry.events.every(
        (event) =>
          event.status === AgentWorkEventStatus.COMPLETED ||
          event.status === AgentWorkEventStatus.CANCELLED,
      )
    ) {
      return 'completed' as const;
    }
    return 'live' as const;
  }, [entry.events]);

  const isTerminal = terminalStatus !== 'live';
  const isArchived = entry.presentation === 'archived' || isTerminal;
  const [isExpanded, setIsExpanded] = useState(
    entry.presentation === 'live' && !isTerminal,
  );
  const hasTerminalEvent = entry.events.some((event) =>
    [
      AgentWorkEventStatus.COMPLETED,
      AgentWorkEventStatus.FAILED,
      AgentWorkEventStatus.CANCELLED,
    ].includes(event.status),
  );
  const durationLabel = formatWorkedDuration(entry.totalDurationMs);
  const failureDetail = useMemo(() => {
    if (terminalStatus !== 'failed') {
      return null;
    }
    const failed = [...entry.events]
      .reverse()
      .find((event) => event.status === AgentWorkEventStatus.FAILED);
    return formatAgentErrorDetail(failed?.detail ?? failed?.label ?? null);
  }, [entry.events, terminalStatus]);

  const stepCount = entry.events.length;
  const statusLabel =
    terminalStatus === 'failed'
      ? 'Failed'
      : terminalStatus === 'cancelled'
        ? 'Cancelled'
        : terminalStatus === 'completed'
          ? 'Completed'
          : 'Running';

  return (
    <div className="mb-3 flex justify-start motion-reduce:animate-none animate-in fade-in slide-in-from-bottom-1 duration-200 ease-out">
      <div
        className={cn(
          'w-full max-w-none rounded-lg border bg-background-secondary/80 p-2 shadow-[0_1px_0_rgba(0,0,0,0.18)]',
          terminalStatus === 'failed'
            ? 'border-destructive/30'
            : 'border-border/70',
        )}
      >
        {isArchived ? (
          <Button
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
            onClick={() => setIsExpanded((prev) => !prev)}
            aria-expanded={isExpanded}
            className="flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left transition-colors hover:bg-background/55"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-xs font-medium text-foreground/85">
                <HiClock className="size-3.5 shrink-0 text-foreground/45" />
                <span>
                  {durationLabel
                    ? `Worked ${durationLabel}`
                    : terminalStatus === 'failed'
                      ? 'Run failed'
                      : 'Completed run'}
                </span>
              </div>
              <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[11px] text-foreground/45">
                <span>
                  {stepCount} step{stepCount !== 1 ? 's' : ''}
                </span>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-1">
                  {terminalStatus === 'failed' ? (
                    <HiExclamationCircle className="size-3.5 text-destructive" />
                  ) : (
                    <HiCheckCircle className="size-3.5 text-emerald-500" />
                  )}
                  {statusLabel}
                </span>
                {failureDetail && !isExpanded ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="truncate text-foreground/40">
                      {failureDetail}
                    </span>
                  </>
                ) : null}
              </div>
            </div>
            <HiChevronDown
              className={cn(
                'size-4 shrink-0 text-foreground/42 transition-transform',
                isExpanded ? 'rotate-180' : '',
              )}
            />
          </Button>
        ) : (
          <div className="flex items-center justify-between gap-2 px-1.5 pb-2 pt-0.5">
            <div className="text-[11px] font-medium tracking-wide text-foreground/50">
              Run
              <span className="mx-1.5 text-foreground/30" aria-hidden="true">
                ·
              </span>
              {stepCount} step{stepCount !== 1 ? 's' : ''}
            </div>
            <div className="text-[11px] text-foreground/40">{statusLabel}</div>
          </div>
        )}

        {isExpanded
          ? entry.events.map((event) => (
              <TimelineWorkEntry
                key={event.id}
                event={event}
                stopActiveAnimation={
                  hasTerminalEvent &&
                  (event.status === AgentWorkEventStatus.PENDING ||
                    event.status === AgentWorkEventStatus.RUNNING)
                }
              />
            ))
          : null}
      </div>
    </div>
  );
}

function formatWorkedDuration(durationMs: number | null): string | null {
  if (durationMs == null) {
    return null;
  }

  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }

  const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes <= 0) {
    return `${totalSeconds}s`;
  }

  return `${minutes}m ${seconds}s`;
}
