'use client';

import { useBrand } from '@genfeedai/contexts/user/brand-context/brand-context';
import { StreaksService } from '@genfeedai/services/engagement/streaks.service';
import type { IStreakCalendarResponse, IStreakSummary } from '@genfeedai/types';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

const STREAK_CACHE_TTL_MS = 60_000;

interface UseStreakOptions {
  includeCalendar?: boolean;
  initialStreak?: IStreakSummary | null;
}

export interface UseStreakReturn {
  streak: IStreakSummary | null;
  calendar: IStreakCalendarResponse['days'];
  isLoading: boolean;
  isVisible: boolean;
  refetch: () => Promise<void>;
}

export function useStreak(options: UseStreakOptions = {}): UseStreakReturn {
  const { includeCalendar = true, initialStreak = null } = options;
  const { organizationId } = useBrand();

  const getStreaksService = useAuthedService((token: string) =>
    StreaksService.getInstance(token, organizationId),
  );

  const initialData = initialStreak
    ? { calendar: {} as IStreakCalendarResponse['days'], streak: initialStreak }
    : undefined;

  const {
    data,
    isLoading,
    refetch: rqRefetch,
  } = useQuery({
    enabled: Boolean(organizationId),
    initialData,
    initialDataUpdatedAt: initialStreak ? 0 : undefined,
    queryFn: async () => {
      if (!organizationId) {
        return null;
      }

      const service = await getStreaksService();
      const streak = await service.getMyStreak();
      const calendar = includeCalendar
        ? await service.getMyCalendar()
        : { days: {} };

      return { calendar: calendar.days, streak };
    },
    queryKey: ['streak', organizationId, includeCalendar],
    staleTime: STREAK_CACHE_TTL_MS,
  });

  const refetch = async () => {
    await rqRefetch();
  };

  return useMemo(
    () => ({
      calendar: data?.calendar ?? {},
      isLoading,
      isVisible: Boolean(organizationId),
      refetch,
      streak: data?.streak ?? null,
    }),
    [data?.calendar, data?.streak, isLoading, organizationId, refetch],
  );
}
