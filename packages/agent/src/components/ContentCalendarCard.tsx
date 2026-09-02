import type { AgentUiAction } from '@genfeedai/agent/models/agent-chat.model';
import { ButtonVariant } from '@genfeedai/contracts';
import { Button } from '@ui/primitives/button';
import { Calendar, Plus } from 'lucide-react';
import type { ReactElement } from 'react';

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
    <div className="my-2 border border-border bg-background p-4">
      <div className="mb-3 flex items-center gap-2">
        <Calendar className="size-5 text-teal-500" />
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
                className={`flex flex-col items-center p-1.5 ${
                  isEmpty
                    ? 'border border-dashed border-border bg-muted/50'
                    : 'bg-muted'
                }`}
              >
                <span className="text-2xs text-muted-foreground">
                  {dayName}
                </span>
                <span className="text-xs font-medium text-foreground">
                  {dayNum}
                </span>
                {isEmpty ? (
                  <Button
                    variant={ButtonVariant.UNSTYLED}
                    withWrapper={false}
                    onClick={() => onFillGap?.(day.date)}
                    className="mt-1 flex size-5 items-center justify-center rounded-full bg-info/10 text-info transition-colors hover:bg-info/10  "
                    tooltip="Fill Gap"
                  >
                    <Plus className="size-3" />
                  </Button>
                ) : (
                  <span className="mt-1 flex size-5 items-center justify-center rounded-full bg-info/10 text-2xs font-medium text-info ">
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
