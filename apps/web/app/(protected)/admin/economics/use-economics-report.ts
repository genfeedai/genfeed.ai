'use client';

import type { IEconomicsQuery } from '@genfeedai/contracts/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { AdminEconomicsService } from '@services/admin/economics.service';
import { logger } from '@services/core/logger.service';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  buildEconomicsRange,
  DEFAULT_ECONOMICS_PERIOD_DAYS,
} from './economics-report.util';

/**
 * One economics report for the selected period. Every economics page loads a
 * single report, so the period state, the authed service and the query live
 * here once.
 */
export function useEconomicsReport<T>(
  reportKey: 'costs' | 'coverage' | 'overview' | 'revenue',
  load: (
    service: AdminEconomicsService,
    query: IEconomicsQuery,
    signal?: AbortSignal,
  ) => Promise<T>,
) {
  const [periodDays, setPeriodDays] = useState(DEFAULT_ECONOMICS_PERIOD_DAYS);
  const getService = useAuthedService((token: string) =>
    AdminEconomicsService.getInstance(token),
  );
  const range = useMemo(
    () => buildEconomicsRange(Number(periodDays)),
    [periodDays],
  );

  const query = useQuery({
    queryFn: async ({ signal }) => load(await getService(), range, signal),
    queryKey: ['admin-economics', reportKey, range.from, range.to],
  });

  useEffect(() => {
    if (query.error) {
      logger.error(`GET /admin/economics/${reportKey} failed`, query.error);
    }
  }, [query.error, reportKey]);

  return { ...query, periodDays, setPeriodDays };
}
