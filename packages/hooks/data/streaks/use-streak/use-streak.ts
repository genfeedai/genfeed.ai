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

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['streak', organizationId, includeCalendar],
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
    enabled: Boolean(organizationId),
    staleTime: STREAK_CACHE_TTL_MS,
    initialData: initialStreak
      ? { calendar: {}, streak: initialStreak }
      : undefined,
  });

  return useMemo(
    () => ({
      calendar: data?.calendar ?? {},
      isLoading,
      isVisible: Boolean(organizationId),
      refetch: async () => {
        await refetch();
      },
      streak: data?.streak ?? null,
    }),
    [data?.calendar, data?.streak, isLoading, organizationId, refetch],
  );
}
