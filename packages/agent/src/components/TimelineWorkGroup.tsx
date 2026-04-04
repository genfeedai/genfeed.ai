import { TimelineWorkEntry } from '@cloud/agent/components/TimelineWorkEntry';
import { AgentWorkEventStatus } from '@cloud/agent/models/agent-chat.model';
import type { TimelineWorkGroup as TimelineWorkGroupEntry } from '@cloud/agent/utils/derive-timeline';
import { cn } from '@helpers/formatting/cn/cn.util';
import { type ReactElement, useState } from 'react';
import { HiCheckCircle, HiChevronDown, HiClock } from 'react-icons/hi2';

interface TimelineWorkGroupProps {
  entry: TimelineWorkGroupEntry;
}

export function TimelineWorkGroup({
  entry,
}: TimelineWorkGroupProps): ReactElement {
  const isArchived = entry.presentation === 'archived';
  const [isExpanded, setIsExpanded] = useState(!isArchived);
  const hasTerminalEvent = entry.events.some((event) =>
    [
      AgentWorkEventStatus.COMPLETED,
      AgentWorkEventStatus.FAILED,
      AgentWorkEventStatus.CANCELLED,
    ].includes(event.status),
  );
  const durationLabel = formatWorkedDuration(entry.totalDurationMs);

  return (
    <div className="mb-3 flex justify-start motion-reduce:animate-none animate-in fade-in slide-in-from-bottom-1 duration-200 ease-out">
      <div className="max-w-[85%] rounded-xl border border-border/40 bg-card/25 p-2 space-y-0.5">
        {isArchived ? (
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            aria-expanded={isExpanded}
            className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/[0.03]"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground/82">
                <HiClock className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
                <span>
                  {durationLabel
                    ? `Worked for ${durationLabel}`
                    : 'Completed run'}
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground/70">
                <span>
                  {entry.events.length} step
                  {entry.events.length !== 1 ? 's' : ''}
                </span>
                <span aria-hidden="true">•</span>
                <span className="inline-flex items-center gap-1">
                  <HiCheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                  Completed
                </span>
              </div>
            </div>
            <HiChevronDown
              className={cn(
                'h-4 w-4 shrink-0 text-muted-foreground/70 transition-transform',
                isExpanded ? 'rotate-180' : '',
              )}
            />
          </button>
        ) : (
          <div className="px-1 pb-1 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/60">
            ⚡ {entry.events.length} step{entry.events.length !== 1 ? 's' : ''}
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
