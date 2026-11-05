'use client';

import { useOptionalAnalyticsContext } from '@genfeedai/contexts/analytics/analytics-context';
import {
  EMPTY_PAGE_TOTALS,
  ITEMS_PER_PAGE,
} from '@genfeedai/contracts/constants';
import type {
  ICreativePattern,
  IPageTotals,
  IPaginatedResponse,
} from '@genfeedai/contracts/interfaces';
import { CreativePatternsService } from '@genfeedai/services/analytics/creative-patterns.service';
import { logger } from '@genfeedai/services/core/logger.service';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import { useCollectionScope } from '@hooks/navigation/use-collection-scope/use-collection-scope';
import type { PatternLabFilters } from '@/props/analytics/performance-lab.props';

export interface UsePatternContextReturn {
  patterns: ICreativePattern[];
  pageTotals: IPageTotals;
  isLoading: boolean;
  error: string | null;
}

const EMPTY_PATTERNS: ICreativePattern[] = [];

/**
 * Loads one server-side page of patterns and its pagination metadata. Pages
 * are cached per brand, filters and page: returning paints the cached page at
 * once, and the analytics Refresh re-reads it in the background.
 */
export function usePatternContext(
  filters?: PatternLabFilters,
  page: number = 1,
): UsePatternContextReturn {
  const { brandId } = useCollectionScope();
  const refreshTrigger = useOptionalAnalyticsContext()?.refreshTrigger ?? 0;
  const scopeKey = ['creative-patterns', brandId || null] as const;
  const patternFilters = {
    brandId: brandId || undefined,
    patternType: filters?.patternType,
    platform: filters?.platform,
    scope: filters?.scope,
  };

  const patternsQuery = useAuthedQuery<
    CreativePatternsService,
    IPaginatedResponse<ICreativePattern>
  >({
    // A new page or filter keeps the current rows on screen while it loads.
    keepPreviousDataWithin: scopeKey,
    queryFn: async (service, signal) => {
      try {
        return await service.findAll(
          patternFilters,
          { limit: ITEMS_PER_PAGE, page },
          signal,
        );
      } catch (err: unknown) {
        if (!signal.aborted) {
          logger.error('usePatternContext: fetch failed', {
            error: err,
            reportToSentry: false,
          });
        }
        throw err;
      }
    },
    queryKey: [
      ...scopeKey,
      {
        patternType: filters?.patternType ?? null,
        platform: filters?.platform ?? null,
        scope: filters?.scope ?? null,
      },
      page,
    ],
    refreshKey: refreshTrigger,
    service: (token: string) => CreativePatternsService.getInstance(token),
  });

  const patternsPage = patternsQuery.data;
  const queryError: unknown = patternsQuery.error;
  const error =
    queryError && !patternsPage
      ? queryError instanceof Error
        ? queryError.message
        : 'Failed to load patterns'
      : null;

  return {
    error,
    isLoading: patternsQuery.isPending,
    patterns: patternsPage?.items ?? EMPTY_PATTERNS,
    pageTotals: patternsPage
      ? { totalDocs: patternsPage.total, totalPages: patternsPage.totalPages }
      : EMPTY_PAGE_TOTALS,
  };
}
