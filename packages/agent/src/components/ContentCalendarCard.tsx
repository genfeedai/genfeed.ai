import type { AgentUiAction } from '@cloud/agent/models/agent-chat.model';
import type { ReactElement } from 'react';
import { HiCalendar, HiPlus } from 'react-icons/hi2';

interface ContentCalendarCardProps {
  action: AgentUiAction;
  onFillGap?: (date: string) => void;
}

function formatDayLabel(dateStr: string): { dayName: string; dayNum: string } {
  const date = new Date(dateStr);
  const dayName = date.toLocaleDateString(undefined, { weekday: 'short' });
  const dayNum = String(date.getDate());
  return { dayName, dayNum };
}

export function ContentCalendarCard({
  action,
  onFillGap,
}: ContentCalendarCardProps): ReactElement {
  const days = action.calendarDays ?? [];

  return (
    <div className="my-2 rounded-lg border border-border bg-background p-4">
      <div className="mb-3 flex items-center gap-2">
        <HiCalendar className="h-5 w-5 text-teal-500" />
        <h3 className="text-sm font-semibold">
          {action.title || 'Content Calendar'}
        </h3>
      </div>

      {action.description && (
        <p className="mb-3 text-xs text-muted-foreground">
          {action.description}
        </p>
      )}

      {days.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          No calendar data available
        </p>
      ) : (
        <div className="grid grid-cols-7 gap-1">
          {days.map((day) => {
            const { dayName, dayNum } = formatDayLabel(day.date);
            const isEmpty = day.postCount === 0;

            return (
              <div
                key={day.date}
                className={`flex flex-col items-center rounded p-1.5 ${
                  isEmpty
                    ? 'border border-dashed border-border bg-muted/50'
                    : 'bg-muted'
                }`}
              >
                <span className="text-[9px] text-muted-foreground">
                  {dayName}
                </span>
                <span className="text-xs font-medium text-foreground">
                  {dayNum}
                </span>
                {isEmpty ? (
                  <button
                    type="button"
                    onClick={() => onFillGap?.(day.date)}
                    className="mt-1 flex h-5 w-5 items-center justify-center rounded-full bg-teal-50 text-teal-600 transition-colors hover:bg-teal-100 dark:bg-teal-900/30 dark:text-teal-400"
                    title="Fill Gap"
                  >
                    <HiPlus className="h-3 w-3" />
                  </button>
                ) : (
                  <span className="mt-1 flex h-5 w-5 items-center justify-center rounded-full bg-teal-500/10 text-[10px] font-medium text-teal-600 dark:text-teal-400">
                    {day.postCount}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
