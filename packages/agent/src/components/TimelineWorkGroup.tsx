import { TimelineWorkEntry } from '@genfeedai/agent/components/TimelineWorkEntry';
import { AgentWorkEventStatus } from '@genfeedai/agent/models/agent-chat.model';
import type { TimelineWorkGroup as TimelineWorkGroupEntry } from '@genfeedai/agent/utils/derive-timeline';
import { ButtonVariant } from '@genfeedai/enums';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
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
      <div className="w-full max-w-none rounded-2xl border border-border/65 bg-background-secondary/68 p-2.5 shadow-[0_1px_0_rgba(0,0,0,0.18)]">
        {isArchived ? (
          <Button
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
            onClick={() => setIsExpanded((prev) => !prev)}
            aria-expanded={isExpanded}
            className="flex w-full items-center justify-between gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-background/55"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground/82">
                <HiClock className="h-3.5 w-3.5 shrink-0 text-foreground/44" />
                <span>
                  {durationLabel
                    ? `Worked for ${durationLabel}`
                    : 'Completed run'}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.12em] text-foreground/38">
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
                'h-4 w-4 shrink-0 text-foreground/42 transition-transform',
                isExpanded ? 'rotate-180' : '',
              )}
            />
          </Button>
        ) : (
          <div className="px-1 pb-2 text-[10px] font-mono uppercase tracking-[0.14em] text-foreground/40">
            Run <span aria-hidden="true">·</span> {entry.events.length} step
            {entry.events.length !== 1 ? 's' : ''}
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
