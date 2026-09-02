import { CalendarSlotState } from '@genfeedai/contracts';
import type { ICalendarSlot } from '@genfeedai/contracts/interfaces';

export type CalendarDayAggregate = {
  dayKey: string;
  filledCount: number;
  instant: string;
  missingCount: number;
  missingIdentityKeys: string[];
};

type CalendarDensitySource = {
  identityKey?: string;
  instant: string;
  kind: 'filled' | 'missing';
};

export function isUnfilledCalendarSlot(slot: ICalendarSlot): boolean {
  return (
    slot.state === CalendarSlotState.MISSING ||
    slot.state === CalendarSlotState.GENERATING ||
    slot.state === CalendarSlotState.GENERATE_FAILED
  );
}

export function isMissingCalendarSlot(slot: ICalendarSlot): boolean {
  return slot.state === CalendarSlotState.MISSING;
}

function dayKeyFromInstant(instant: string): string {
  const date = new Date(instant);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function middayInstant(dayKey: string): string {
  const [year, month, day] = dayKey.split('-').map(Number);
  return new Date(
    year ?? 0,
    (month ?? 1) - 1,
    day ?? 1,
    12,
    0,
    0,
  ).toISOString();
}

export function aggregateCalendarItemsByDay(
  items: CalendarDensitySource[],
): CalendarDayAggregate[] {
  const days = new Map<string, CalendarDayAggregate>();

  for (const item of items) {
    const dayKey = dayKeyFromInstant(item.instant);
    const current = days.get(dayKey) ?? {
      dayKey,
      filledCount: 0,
      instant: middayInstant(dayKey),
      missingCount: 0,
      missingIdentityKeys: [],
    };

    if (item.kind === 'filled') {
      current.filledCount += 1;
    } else {
      current.missingCount += 1;
      if (item.identityKey) {
        current.missingIdentityKeys.push(item.identityKey);
      }
    }

    days.set(dayKey, current);
  }

  return [...days.values()].sort((left, right) =>
    left.dayKey.localeCompare(right.dayKey),
  );
}
