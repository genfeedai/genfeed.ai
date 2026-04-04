import { useCalendarWeekRange } from '@hooks/utils/use-calendar-week-range/use-calendar-week-range';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('useCalendarWeekRange', () => {
  const baseDate = new Date(2025, 0, 15, 12, 0, 0);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(baseDate);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the current week range from Sunday to Saturday', () => {
    const { result } = renderHook(() => useCalendarWeekRange());
    const [range] = result.current;

    expect(range).not.toBeNull();
    expect(range?.start.getDay()).toBe(0);
    expect(range?.end.getDay()).toBe(6);
    expect(range?.start.getHours()).toBe(0);
    expect(range?.start.getMinutes()).toBe(0);
    expect(range?.end.getHours()).toBe(23);
    expect(range?.end.getMinutes()).toBe(59);
  });

  it('allows updating the week range', () => {
    const { result } = renderHook(() => useCalendarWeekRange());
    const nextStart = new Date(2025, 0, 19, 0, 0, 0);
    const nextEnd = new Date(2025, 0, 25, 23, 59, 59);

    act(() => {
      result.current[1]({ end: nextEnd, start: nextStart });
    });

    const [range] = result.current;
    expect(range?.start).toEqual(nextStart);
    expect(range?.end).toEqual(nextEnd);
  });
});
