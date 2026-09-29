import { CalendarSlotState, PostCategory } from '@genfeedai/contracts';
import type { ICalendarSlot } from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';
import {
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
