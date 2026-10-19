'use client';

import { useAnalyticsContext } from '@contexts/analytics/analytics-context';
import { AnalyticsMetric } from '@genfeedai/contracts';
import { ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';
import {
  formatCompactNumberIntl,
  formatPercentageSimple,
} from '@helpers/formatting/format/format.helper';
import { getDateRangeWithDefaults } from '@helpers/utils/date-range.util';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import {
  isCollectionFetchReady,
  useCollectionScope,
} from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { useDebounce } from '@hooks/utils/use-debounce/use-debounce';
import {
  AnalyticsService,
  type IBrandWithStats,
} from '@services/analytics/analytics.service';
import { logger } from '@services/core/logger.service';
import { AnalyticsMetricLabel } from '@ui/analytics/metric-definition/AnalyticsMetricInfo';
import BrandAvatar from '@ui/display/brand-avatar/BrandAvatar';
import Table from '@ui/display/table/Table';
import AutoPagination from '@ui/navigation/pagination/auto-pagination/AutoPagination';
import FormSearchbar from '@ui/primitives/searchbar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

export interface AnalyticsBrandsListProps {
  basePath?: string;
  /**
   * Narrow the list to the brand in the URL (`/:org/:brand/...`); the org
   * route (`/:org/~/...`) still lists every brand. Platform admin pages have
   * no brand of their own and turn this off.
   */
  isBrandScoped?: boolean;
}

const SEARCH_DEBOUNCE_MS = 300;

export default function AnalyticsBrandsList({
  basePath = '/analytics',
  isBrandScoped = true,
}: AnalyticsBrandsListProps) {
  const { isSignedIn } = useAuthIdentity();
  const scope = useCollectionScope();
  const scopedBrandId = isBrandScoped ? scope.brandId : undefined;
  const isScopeReady = !isBrandScoped || isCollectionFetchReady(scope);
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { replace } = useRouter();
  const currentPage = Number(searchParams.get('page')) || 1;
  const {
    dateRange,
    filters,
    refreshTrigger,
    setFilter,
    setToolbarNode,
    triggerRefresh,
  } = useAnalyticsContext();
  const getAnalyticsService = useAuthedService((token: string) =>
    AnalyticsService.getInstance(token),
  );

  const [brandsData, setBrandsData] = useState<IBrandWithStats[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  const searchTerm = filters.query ?? '';
  // The API searches, so a keystroke must not cost a request.
  const debouncedSearchTerm = useDebounce(searchTerm, SEARCH_DEBOUNCE_MS);
  const sortBy = (filters.sort ?? AnalyticsMetric.ENGAGEMENT) as
    | AnalyticsMetric.ENGAGEMENT
    | AnalyticsMetric.VIEWS
    | AnalyticsMetric.POSTS;
  const buildDetailHref = (brandId: string): string => {
    const detailParams = new URLSearchParams(searchParams.toString());
    detailParams.delete('page');
    const query = detailParams.toString();
    return query
      ? `${basePath}/brands/${brandId}?${query}`
      : `${basePath}/brands/${brandId}`;
  };

  // `searchParams`, `pathname` and `replace` are read only to clear an
  // out-of-range page; the URL query must not refetch the list on its own.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  useEffect(() => {
    // Refresh nonce from analytics context: force refetch when refresh button is pressed
    if (refreshTrigger < 0) {
      return;
    }

    const controller = new AbortController();
    const fetchBrandsData = async () => {
      if (!isSignedIn || !isScopeReady) {
        return;
      }
      if (!dateRange.startDate || !dateRange.endDate) {
        return;
      }

      setIsLoading(true);
      setIsError(false);
      try {
        const service = await getAnalyticsService();
        const { startDate, endDate } = getDateRangeWithDefaults(
          dateRange?.startDate ?? undefined,
          dateRange?.endDate ?? undefined,
        );
        const response = await service.getBrandsWithStats(
          {
            ...(scopedBrandId ? { brandId: scopedBrandId } : {}),
            endDate,
            limit: ITEMS_PER_PAGE,
            page: currentPage,
            ...(debouncedSearchTerm ? { search: debouncedSearchTerm } : {}),
            sort: sortBy,
            startDate,
          },
          controller.signal,
        );
        if (controller.signal.aborted) return;

        // A new search, sort or date range can leave the URL page past the
        // last page of the new result set: start over at page 1.
        if (
          currentPage > 1 &&
          response.pagination &&
          currentPage > Math.max(1, response.pagination.totalPages)
        ) {
          const params = new URLSearchParams(searchParams.toString());
          params.delete('page');
          const query = params.toString();
          replace(query ? `${pathname}?${query}` : pathname, {
            scroll: false,
          });
          return;
        }

        setBrandsData(response.data);
      } catch (error) {
        if (!controller.signal.aborted) {
          logger.error('Failed to fetch brand analytics list', error);
          setIsError(true);
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    };

    void fetchBrandsData();
    return () => controller.abort();
  }, [
    isSignedIn,
    isScopeReady,
    scopedBrandId,
    dateRange,
    refreshTrigger,
    sortBy,
    debouncedSearchTerm,
    currentPage,
    getAnalyticsService,
  ]);

  const toolbar = useMemo(
    () => (
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <FormSearchbar
          ariaLabel="Search brands"
          placeholder="Search brands..."
          value={searchTerm}
          onChange={(e) => setFilter('query', e.target.value)}
          className="w-full sm:w-64"
        />

        <Select
          value={sortBy}
          onValueChange={(value) => setFilter('sort', value)}
        >
          <SelectTrigger
            aria-label="Sort brand analytics"
            className="w-full sm:w-44"
          >
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={AnalyticsMetric.ENGAGEMENT}>
              Sort by Engagement
            </SelectItem>
            <SelectItem value={AnalyticsMetric.VIEWS}>Sort by Views</SelectItem>
            <SelectItem value={AnalyticsMetric.POSTS}>Sort by Posts</SelectItem>
          </SelectContent>
        </Select>
      </div>
    ),
    [searchTerm, sortBy, setFilter],
  );

  useEffect(() => {
    setToolbarNode(toolbar);
    return () => setToolbarNode(null);
  }, [setToolbarNode, toolbar]);

  return (
    <>
      <Table
        ariaLabel="Brands"
        items={brandsData}
        isLoading={isLoading}
        error={
          isError
            ? {
                title: 'Brand analytics could not be loaded.',
                onRetry: triggerRefresh,
              }
            : undefined
        }
        emptyLabel={
          searchTerm ? 'No brands match your search' : 'No brands found'
        }
        getRowKey={(brand) => brand.id}
        getRowLink={(brand) => ({
          href: buildDetailHref(brand.id),
          label: `Open ${brand.name} analytics`,
        })}
        columns={[
          {
            header: 'Brand',
            key: 'name',
            render: (brand) => (
              <div className="flex items-center gap-3">
                <BrandAvatar logoUrl={brand.logo} name={brand.name} size="lg" />
                <div>
                  <div className="font-medium">{brand.name}</div>
                  <div className="text-xs text-foreground/60">
                    {brand.organizationName}
                  </div>
                  <div className="text-xs text-foreground/50 mt-0.5">
                    {brand.activePlatforms.length} platform
                    {brand.activePlatforms.length !== 1 ? 's' : ''}
                  </div>
                </div>
              </div>
            ),
          },
          {
            header: (
              <AnalyticsMetricLabel metric="posts">Posts</AnalyticsMetricLabel>
            ),
            key: 'totalPosts',
            render: (brand) => (
              <div className="text-center">
                <div className="font-mono font-semibold">
                  {formatCompactNumberIntl(brand.totalPosts)}
                </div>
                <div className="text-xs text-foreground/50">published</div>
              </div>
            ),
          },
          {
            header: (
              <AnalyticsMetricLabel metric="views">Views</AnalyticsMetricLabel>
            ),
            key: 'totalViews',
            render: (brand) => (
              <div className="text-center">
                <div className="font-mono font-semibold">
                  {formatCompactNumberIntl(brand.totalViews)}
                </div>
                <div className="text-xs text-foreground/50">total</div>
              </div>
            ),
          },
          {
            header: (
              <AnalyticsMetricLabel metric="engagement">
                Engagement
              </AnalyticsMetricLabel>
            ),
            key: 'totalEngagement',
            render: (brand) => (
              <div className="text-center">
                <div className="font-mono font-semibold">
                  {formatCompactNumberIntl(brand.totalEngagement)}
                </div>
                <div className="text-xs text-foreground/50">interactions</div>
              </div>
            ),
          },
          {
            header: (
              <AnalyticsMetricLabel metric="engagementRate">
                Eng. Rate
              </AnalyticsMetricLabel>
            ),
            key: 'avgEngagementRate',
            render: (brand) => (
              <div className="text-center">
                <div className="font-mono font-semibold">
                  {formatPercentageSimple(brand.avgEngagementRate, 2)}
                </div>
                <div className="text-xs text-foreground/50">average</div>
              </div>
            ),
          },
          {
            header: 'Growth',
            key: 'growth',
            render: (brand) => (
              <div className="text-center">
                <div
                  className={`font-mono font-semibold ${
                    brand.growth > 0
                      ? 'text-success'
                      : brand.growth < 0
                        ? 'text-error'
                        : ''
                  }`}
                >
                  {brand.growth > 0 ? '+' : ''}
                  {formatPercentageSimple(brand.growth, 2)}
                </div>
                <div className="text-xs text-foreground/50">vs last period</div>
              </div>
            ),
          },
        ]}
        actions={[]}
      />
      <div className="mt-4">
        <AutoPagination showTotal totalLabel="brands" />
      </div>
    </>
  );
}
