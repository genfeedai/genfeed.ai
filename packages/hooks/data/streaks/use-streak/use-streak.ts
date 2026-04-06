'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import type { IStreakCalendarResponse, IStreakSummary } from '@genfeedai/types';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useResource } from '@hooks/data/resource/use-resource/use-resource';
import { StreaksService } from '@services/engagement/streaks.service';
import { useMemo } from 'react';

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

  const { data, isLoading, refresh } = useResource(
    async (_signal: AbortSignal) => {
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
    {
      dependencies: [includeCalendar, organizationId],
      enabled: Boolean(organizationId),
      initialData: initialStreak
        ? { calendar: {}, streak: initialStreak }
        : undefined,
      revalidateOnMount: initialStreak == null,
    },
  );

  return useMemo(
    () => ({
      calendar: data?.calendar ?? {},
      isLoading,
      isVisible: Boolean(organizationId),
      refetch: refresh,
      streak: data?.streak ?? null,
    }),
    [data?.calendar, data?.streak, isLoading, organizationId, refresh],
  );
}
