import { CalendarSlotState, PostCategory } from '@genfeedai/enums';
import type { ICalendarSlot } from '@genfeedai/interfaces';
import { describe, expect, it } from 'vitest';
import {
  aggregateCalendarItemsByDay,
  isMissingCalendarSlot,
  isUnfilledCalendarSlot,
} from './calendar-day-aggregate';

function slot(overrides: Partial<ICalendarSlot> = {}): ICalendarSlot {
  return {
    brandId: 'brand-1',
    cadenceId: 'cadence-1',
    credentialId: 'credential-1',
    format: PostCategory.REEL,
    generatedItemId: null,
    generatedItemType: null,
    id: 'slot-1',
    identityKey: 'slot-1',
    instant: '2026-03-12T10:00:00.000Z',
    lastFailureReason: null,
    resolvedBrief: '',
    state: CalendarSlotState.MISSING,
    timezone: 'UTC',
    ...overrides,
  };
}

describe('aggregateCalendarItemsByDay', () => {
  it('counts filled vs missing per day and keeps missing identities', () => {
    const aggregates = aggregateCalendarItemsByDay([
      {
        identityKey: 'ghost-1',
        instant: '2026-03-12T08:00:00.000Z',
        kind: 'missing',
      },
      {
        identityKey: 'ghost-2',
        instant: '2026-03-12T10:00:00.000Z',
        kind: 'missing',
      },
      { instant: '2026-03-12T12:00:00.000Z', kind: 'filled' },
      {
        identityKey: 'ghost-next',
        instant: '2026-03-13T09:00:00.000Z',
        kind: 'missing',
      },
    ]);

    expect(aggregates).toHaveLength(2);
    expect(aggregates[0]).toMatchObject({
      filledCount: 1,
      missingCount: 2,
      missingIdentityKeys: ['ghost-1', 'ghost-2'],
    });
    expect(aggregates[1]).toMatchObject({
      filledCount: 0,
      missingCount: 1,
      missingIdentityKeys: ['ghost-next'],
    });
  });

  it('does not emit a row for every ghost identity', () => {
    const ghosts = Array.from({ length: 12 }, (_, index) => ({
      identityKey: `ghost-${index}`,
      instant: `2026-03-12T${String(8 + index).padStart(2, '0')}:00:00.000Z`,
      kind: 'missing' as const,
    }));

    expect(aggregateCalendarItemsByDay(ghosts)).toHaveLength(1);
    expect(aggregateCalendarItemsByDay(ghosts)[0]?.missingCount).toBe(12);
  });
});

describe('calendar slot density helpers', () => {
  it('treats generating and failed holes as unfilled, not bulk-missing', () => {
    expect(isUnfilledCalendarSlot(slot())).toBe(true);
    expect(
      isUnfilledCalendarSlot(slot({ state: CalendarSlotState.GENERATING })),
    ).toBe(true);
    expect(
      isUnfilledCalendarSlot(
        slot({ state: CalendarSlotState.GENERATE_FAILED }),
      ),
    ).toBe(true);
    expect(isMissingCalendarSlot(slot())).toBe(true);
    expect(
      isMissingCalendarSlot(slot({ state: CalendarSlotState.GENERATING })),
    ).toBe(false);
  });
});
