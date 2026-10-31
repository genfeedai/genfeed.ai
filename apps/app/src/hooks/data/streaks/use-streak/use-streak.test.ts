import { createQueryWrapper } from '@hooks/tests/query-wrapper';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetMyStreak = vi.fn();
const mockGetMyCalendar = vi.fn();
const mockGetService = vi.fn();
const mockUseBrand = vi.fn();

vi.mock('@genfeedai/contexts/user/brand-context/brand-context', () => ({
  useBrand: () => mockUseBrand(),
}));

vi.mock('@hooks/auth/use-authed-service/use-authed-service', () => ({
  useAuthedService: () => mockGetService,
}));

vi.mock('@genfeedai/services/engagement/streaks.service', () => ({
  StreaksService: { getInstance: vi.fn() },
}));

import { useStreak } from './use-streak';

const STREAK = { currentStreak: 4, longestStreak: 9 };
const CALENDAR_DAYS = { '2025-01-01': true };

describe('useStreak', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetMyStreak.mockResolvedValue(STREAK);
    mockGetMyCalendar.mockResolvedValue({ days: CALENDAR_DAYS });
    mockGetService.mockResolvedValue({
      getMyCalendar: mockGetMyCalendar,
      getMyStreak: mockGetMyStreak,
    });
    mockUseBrand.mockReturnValue({ organizationId: 'org-1' });
  });

  it('loads the streak and calendar', async () => {
    const { result } = renderHook(() => useStreak(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.streak).toEqual(STREAK);
    });

    expect(result.current.calendar).toEqual(CALENDAR_DAYS);
    expect(result.current.isVisible).toBe(true);
  });

  it('skips the calendar when includeCalendar is false', async () => {
    const { result } = renderHook(() => useStreak({ includeCalendar: false }), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.streak).toEqual(STREAK);
    });

    expect(mockGetMyCalendar).not.toHaveBeenCalled();
    expect(result.current.calendar).toEqual({});
  });

  it('is hidden and idle without an organization', async () => {
    mockUseBrand.mockReturnValue({ organizationId: undefined });

    const { result } = renderHook(() => useStreak(), {
      wrapper: createQueryWrapper(),
    });

    expect(result.current.isVisible).toBe(false);
    expect(result.current.streak).toBeNull();
    expect(mockGetService).not.toHaveBeenCalled();
  });

  it('seeds initial streak data', () => {
    const initialStreak = { currentStreak: 2, longestStreak: 2 };

    const { result } = renderHook(() => useStreak({ initialStreak }), {
      wrapper: createQueryWrapper(),
    });

    expect(result.current.streak).toEqual(initialStreak);
    expect(result.current.calendar).toEqual({});
  });

  it('refetch reloads the streak', async () => {
    const { result } = renderHook(() => useStreak(), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => {
      expect(result.current.streak).toEqual(STREAK);
    });

    mockGetMyStreak.mockClear();

    await act(async () => {
      await result.current.refetch();
    });

    expect(mockGetMyStreak).toHaveBeenCalled();
  });
});
