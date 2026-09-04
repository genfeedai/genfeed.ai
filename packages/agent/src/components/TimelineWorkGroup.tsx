import { TimelineWorkEntry } from '@genfeedai/agent/components/TimelineWorkEntry';
import {
  AgentWorkEventStatus,
  AgentWorkEventType,
} from '@genfeedai/agent/models/agent-chat.model';
import {
  isActiveWorkEvent,
  isGenericRunLifecycleEvent,
  type TimelineWorkGroup as TimelineWorkGroupEntry,
} from '@genfeedai/agent/utils/derive-timeline';
import { ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import { ChevronDown, CircleAlert, CircleCheck, Clock } from 'lucide-react';
import { memo, type ReactElement, useEffect, useMemo, useState } from 'react';

interface TimelineWorkGroupProps {
  entry: TimelineWorkGroupEntry;
}

/**
 * T3-style compact activity:
 * - Real tool steps only (lifecycle bookends hidden)
 * - Live: steps open + trailing "Working for …"
 * - Settled: one-line "Worked for …" (expand for steps)
 */
function TimelineWorkGroupInner({
  entry,
}: TimelineWorkGroupProps): ReactElement {
  const visibleEvents = useMemo(
    () => entry.events.filter((event) => !isGenericRunLifecycleEvent(event)),
    [entry.events],
  );
  // Lifecycle-only runs still need a duration line; steps stay empty.
  const stepEvents = visibleEvents.length > 0 ? visibleEvents : [];

  const terminalStatus = useMemo(() => {
    const source = entry.events;
    const terminalLifecycleEvent = source
      .filter(
        (event) =>
          isGenericRunLifecycleEvent(event) &&
          (event.event === AgentWorkEventType.COMPLETED ||
            event.event === AgentWorkEventType.FAILED ||
            event.event === AgentWorkEventType.CANCELLED),
      )
      .at(-1);

    // A terminal run bookend is authoritative even when stale pending/running
    // step events remain in the stream snapshot.
    if (terminalLifecycleEvent?.event === AgentWorkEventType.FAILED) {
      return 'failed' as const;
    }
    if (terminalLifecycleEvent?.event === AgentWorkEventType.CANCELLED) {
      return 'cancelled' as const;
    }
    if (terminalLifecycleEvent?.event === AgentWorkEventType.COMPLETED) {
      return 'completed' as const;
    }

    if (source.some((event) => isActiveWorkEvent(event))) {
      return 'live' as const;
    }

    // Prefer the last non-lifecycle tool/step — intermediate create_post
    // failures must not paint the whole group Failed when a later step
    // (or a successful recovery path) completed.
    const toolEvents = source.filter(
      (event) => !isGenericRunLifecycleEvent(event),
    );
    const lastTool = toolEvents.at(-1);

    if (lastTool?.status === AgentWorkEventStatus.FAILED) {
      return 'failed' as const;
    }
    if (lastTool?.status === AgentWorkEventStatus.CANCELLED) {
      return 'cancelled' as const;
    }
    if (
      toolEvents.some(
        (event) => event.status === AgentWorkEventStatus.COMPLETED,
      ) ||
      toolEvents.length === 0
    ) {
      return 'completed' as const;
    }
    if (
      toolEvents.some((event) => event.status === AgentWorkEventStatus.FAILED)
    ) {
      return 'failed' as const;
    }
    if (
      toolEvents.some(
        (event) => event.status === AgentWorkEventStatus.CANCELLED,
      )
    ) {
      return 'cancelled' as const;
    }
    return 'live' as const;
  }, [entry.events]);

  const isTerminal = terminalStatus !== 'live';
  // Collapse whenever settled — presentation archive OR terminal without live work
  const isCollapsible = isTerminal || entry.presentation === 'archived';
  const [isExpanded, setIsExpanded] = useState(
    !isCollapsible && entry.presentation === 'live',
  );
  const [wasCollapsible, setWasCollapsible] = useState(isCollapsible);

  // When a live group settles, collapse without an effect flash.
  if (wasCollapsible !== isCollapsible) {
    setWasCollapsible(isCollapsible);
    if (isCollapsible && isExpanded) {
      setIsExpanded(false);
    }
  }

  const liveElapsedLabel = useLiveElapsedLabel(entry.createdAt, !isTerminal);
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

  const stepCount = stepEvents.length;
  const statusLabel =
    terminalStatus === 'failed'
      ? 'Failed'
      : terminalStatus === 'cancelled'
        ? 'Cancelled'
        : terminalStatus === 'completed'
          ? 'Completed'
          : 'Running';

  const showSteps = stepCount > 0 && (!isCollapsible || isExpanded);

  // Lifecycle-only residue with no tools is not a product row.
  if (stepCount === 0 && isTerminal) {
    return <></>;
  }

  const durationFooter = (
    <div
      className={cn(
        'flex w-full items-center gap-2 px-1 py-1',
        showSteps && 'mt-0.5 border-t border-border/40 pt-1.5',
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden whitespace-nowrap text-xs text-gray-900">
        <Clock className="size-3.5 shrink-0 text-gray-800" />
        {/* Duration is secondary type — never text-muted/text-secondary fill tokens */}
        <span className="shrink-0 font-medium text-gray-900">
          {durationPhrase}
        </span>
        {isTerminal ? (
          <>
            <span aria-hidden="true" className="text-gray-700">
              ·
            </span>
            <span
              className={cn(
                'inline-flex shrink-0 items-center gap-1 text-2xs',
                terminalStatus === 'failed'
                  ? 'font-medium text-destructive'
                  : 'text-gray-900',
              )}
            >
              {terminalStatus === 'failed' ? (
                <CircleAlert className="size-3.5 text-destructive" />
              ) : (
                <CircleCheck className="size-3.5 text-emerald-500" />
              )}
              {statusLabel}
            </span>
            {stepCount > 0 ? (
              <>
                <span aria-hidden="true" className="text-gray-700">
                  ·
                </span>
                <span className="shrink-0 text-2xs text-gray-800">
                  {stepCount} step{stepCount !== 1 ? 's' : ''}
                </span>
              </>
            ) : null}
          </>
        ) : stepCount > 0 ? (
          <>
            <span aria-hidden="true" className="text-gray-700">
              ·
            </span>
            <span className="shrink-0 text-2xs text-gray-800">
              {stepCount} step{stepCount !== 1 ? 's' : ''}
            </span>
          </>
        ) : null}
      </div>
      {isCollapsible && stepCount > 0 ? (
        <ChevronDown
          aria-hidden="true"
          className={cn(
            'size-3.5 shrink-0 text-gray-800 transition-transform',
            isExpanded ? 'rotate-180' : '',
          )}
          data-testid="timeline-work-group-chevron"
        />
      ) : null}
    </div>
  );

  return (
    <div className="mb-3 mt-0.5 flex justify-start motion-reduce:animate-none animate-in fade-in slide-in-from-bottom-1 duration-200 ease-out">
      <div
        className={cn(
          'w-full max-w-none rounded-md border border-transparent px-0.5 py-0.5 hover:border-border/40',
        )}
        data-testid="timeline-work-group"
      >
        {showSteps ? (
          <div className="flex flex-col gap-0 px-0.5">
            {stepEvents.map((event) => (
              <TimelineWorkEntry
                key={event.id}
                event={event}
                stopActiveAnimation={
                  isTerminal &&
                  (event.status === AgentWorkEventStatus.PENDING ||
                    event.status === AgentWorkEventStatus.RUNNING)
                }
              />
            ))}
          </div>
        ) : null}

        {isCollapsible && stepCount > 0 ? (
          <Button
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
            textTransform="none"
            onClick={() => setIsExpanded((prev) => !prev)}
            aria-expanded={isExpanded}
            className="flex w-full min-w-0 items-center rounded-md text-left transition-colors hover:bg-foreground/[0.04]"
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

// Historical entries are structurally shared upstream
// (`computeStableTimelineEntries`), so an unchanged `entry` reference lets a
// settled work group bail out while the live turn streams tokens.
export const TimelineWorkGroup = memo(TimelineWorkGroupInner);

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
