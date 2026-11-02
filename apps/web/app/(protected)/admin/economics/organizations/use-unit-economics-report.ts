'use client';

import {
  ITEMS_PER_PAGE,
  UNIT_ECONOMICS_SORT_KEYS,
  type UnitEconomicsSortKey,
} from '@genfeedai/contracts/constants';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { TableSortDirection } from '@props/ui/display/table.props';
import { AdminUnitEconomicsService } from '@services/admin/unit-economics.service';
import { logger } from '@services/core/logger.service';
import { useQuery } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { UseUnitEconomicsReportOptions } from '@/features/admin/props/unit-economics.props';
import { buildEconomicsRange } from '../economics-report.util';

function isUnitEconomicsSortKey(key: string): key is UnitEconomicsSortKey {
  return (UNIT_ECONOMICS_SORT_KEYS as readonly string[]).includes(key);
}

/**
 * One page of the unit economics report: per organization, or per user inside
 * one organization. Owns the sort and reads the page from the URL so the
 * Economics page and an organization's Spending tab page the same way.
 */
export function useUnitEconomicsReport({
  isEnabled = true,
  organizationId,
  periodDays,
}: UseUnitEconomicsReportOptions) {
  const [sortKey, setSortKey] =
    useState<UnitEconomicsSortKey>('llmProviderCostUsd');
  const [sortDirection, setSortDirection] =
    useState<TableSortDirection>('desc');

  const { replace } = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const currentPage = Number(searchParams.get('page')) || 1;

  // Changing what the report is sorted or filtered by starts over at page 1.
  const resetPage = useCallback(() => {
    const next = new URLSearchParams(searchParamsString);
    if (!next.has('page')) {
      return;
    }
    next.delete('page');
    const query = next.toString();
    replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [pathname, replace, searchParamsString]);

  const getService = useAuthedService((token: string) =>
    AdminUnitEconomicsService.getInstance(token),
  );
  const range = useMemo(
    () => buildEconomicsRange(Number(periodDays)),
    [periodDays],
  );

  const query = useQuery({
    enabled: isEnabled,
    queryFn: async ({ signal }) => {
      const service = await getService();
      return service.getReport(
        {
          from: range.from,
          limit: ITEMS_PER_PAGE,
          page: currentPage,
          sortDirection,
          sortKey,
          to: range.to,
          ...(organizationId ? { organizationId } : {}),
        },
        signal,
      );
    },
    queryKey: [
      'admin-unit-economics',
      range.from,
      range.to,
      organizationId ?? 'organizations',
      currentPage,
      sortKey,
      sortDirection,
    ],
  });

  useEffect(() => {
    if (query.error) {
      logger.error('GET /admin/unit-economics failed', query.error);
    }
  }, [query.error]);

  const onSortChange = (key: string, direction: TableSortDirection) => {
    if (!isUnitEconomicsSortKey(key)) {
      return;
    }
    setSortKey(key);
    setSortDirection(direction);
    resetPage();
  };

  return { ...query, onSortChange, resetPage, sortDirection, sortKey };
}
