import { TimelineWorkEntry } from '@genfeedai/agent/components/TimelineWorkEntry';
import { AgentWorkEventStatus } from '@genfeedai/agent/models/agent-chat.model';
import type { TimelineWorkGroup as TimelineWorkGroupEntry } from '@genfeedai/agent/utils/derive-timeline';
import { formatAgentErrorDetail } from '@genfeedai/agent/utils/format-agent-error.util';
import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import { type ReactElement, useEffect, useMemo, useState } from 'react';
import {
  HiCheckCircle,
  HiChevronDown,
  HiClock,
  HiExclamationCircle,
} from 'react-icons/hi2';

interface TimelineWorkGroupProps {
  entry: TimelineWorkGroupEntry;
}

/**
 * T3-inspired run card: steps first, duration always last.
 * - Live: "Working for 12s" trails the open step list
 * - Settled: collapsed "Worked for 3m 15s" row; expand reveals steps above the
 *   same trailing duration line
 */
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
  // Only archive presentation collapses by default. Fresh failures stay open
  // (still presentation: 'live' from derive-timeline) so the user sees steps.
  const isCollapsible = entry.presentation === 'archived';
  const [isExpanded, setIsExpanded] = useState(!isCollapsible);
  const hasTerminalEvent = entry.events.some((event) =>
    [
      AgentWorkEventStatus.COMPLETED,
      AgentWorkEventStatus.FAILED,
      AgentWorkEventStatus.CANCELLED,
    ].includes(event.status),
  );

  const liveElapsedLabel = useLiveElapsedLabel(
    entry.createdAt,
    !isTerminal && entry.presentation === 'live',
  );
  const settledDurationLabel = formatDurationMs(entry.totalDurationMs);
  const durationPhrase = isTerminal
    ? settledDurationLabel
      ? `Worked for ${settledDurationLabel}`
      : terminalStatus === 'failed'
        ? 'Run failed'
        : 'Worked'
    : liveElapsedLabel
      ? `Working for ${liveElapsedLabel}`
      : 'Working…';

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

  const showSteps = !isCollapsible || isExpanded;

  const durationFooter = (
    <div
      className={cn(
        'flex items-center justify-between gap-2 px-2.5 py-2',
        showSteps && 'mt-1 border-t border-border/50',
      )}
    >
      <div className="flex min-w-0 items-center gap-1.5 text-xs text-foreground/55">
        <HiClock className="size-3.5 shrink-0 text-foreground/40" />
        <span className="font-medium text-foreground/70">{durationPhrase}</span>
        {isTerminal ? (
          <>
            <span aria-hidden="true" className="text-foreground/25">
              ·
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] text-foreground/45">
              {terminalStatus === 'failed' ? (
                <HiExclamationCircle className="size-3.5 text-destructive" />
              ) : (
                <HiCheckCircle className="size-3.5 text-emerald-500" />
              )}
              {statusLabel}
            </span>
            <span aria-hidden="true" className="text-foreground/25">
              ·
            </span>
            <span className="text-[11px] text-foreground/40">
              {stepCount} step{stepCount !== 1 ? 's' : ''}
            </span>
          </>
        ) : (
          <>
            <span aria-hidden="true" className="text-foreground/25">
              ·
            </span>
            <span className="text-[11px] text-foreground/40">
              {stepCount} step{stepCount !== 1 ? 's' : ''}
            </span>
          </>
        )}
        {failureDetail && !showSteps ? (
          <>
            <span aria-hidden="true" className="text-foreground/25">
              ·
            </span>
            <span className="truncate text-[11px] text-foreground/40">
              {failureDetail}
            </span>
          </>
        ) : null}
      </div>
      {isCollapsible ? (
        <HiChevronDown
          className={cn(
            'size-4 shrink-0 text-foreground/40 transition-transform',
            isExpanded ? 'rotate-180' : '',
          )}
        />
      ) : null}
    </div>
  );

  return (
    <div className="mb-3 flex justify-start motion-reduce:animate-none animate-in fade-in slide-in-from-bottom-1 duration-200 ease-out">
      <div
        className={cn(
          'w-full max-w-none rounded-lg border bg-background-secondary/80 p-1.5 shadow-[0_1px_0_rgba(0,0,0,0.18)]',
          terminalStatus === 'failed'
            ? 'border-destructive/30'
            : 'border-border/70',
        )}
      >
        {showSteps ? (
          <div className="flex flex-col gap-0.5 px-0.5 pt-0.5">
            {entry.events.map((event) => (
              <TimelineWorkEntry
                key={event.id}
                event={event}
                stopActiveAnimation={
                  hasTerminalEvent &&
                  (event.status === AgentWorkEventStatus.PENDING ||
                    event.status === AgentWorkEventStatus.RUNNING)
                }
              />
            ))}
          </div>
        ) : null}

        {isCollapsible ? (
          <Button
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
            onClick={() => setIsExpanded((prev) => !prev)}
            aria-expanded={isExpanded}
            className="w-full rounded-md text-left transition-colors hover:bg-background/55"
          >
            {durationFooter}
          </Button>
        ) : (
          durationFooter
        )}
      </div>
    </div>
  );
}

function formatDurationMs(durationMs: number | null): string | null {
  if (durationMs == null || !Number.isFinite(durationMs) || durationMs < 0) {
    return null;
  }

  if (durationMs < 1000) {
    return `${Math.max(0, Math.round(durationMs))}ms`;
  }

  const totalSeconds = Math.max(1, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes <= 0) {
    return `${totalSeconds}s`;
  }

  return `${minutes}m ${seconds}s`;
}

function useLiveElapsedLabel(startIso: string, isLive: boolean): string | null {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!isLive) {
      return;
    }
    setNowMs(Date.now());
    const id = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, [isLive, startIso]);

  if (!isLive) {
    return null;
  }

  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) {
    return null;
  }

  return formatDurationMs(Math.max(0, nowMs - startMs));
}
