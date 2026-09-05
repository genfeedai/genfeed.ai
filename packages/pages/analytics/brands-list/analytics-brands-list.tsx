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
  AnalyticsService,
  type IBrandWithStats,
} from '@services/analytics/analytics.service';
import { logger } from '@services/core/logger.service';
import Table from '@ui/display/table/Table';
import FormSearchbar from '@ui/primitives/searchbar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/primitives/select';
import { ArrowRight } from 'lucide-react';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

export interface AnalyticsBrandsListProps {
  basePath?: string;
}

const MAX_BRANDS_ANALYTICS_LIMIT = 100;

export default function AnalyticsBrandsList({
  basePath = '/analytics',
}: AnalyticsBrandsListProps) {
  const { isSignedIn } = useAuthIdentity();
  const router = useRouter();
  const searchParams = useSearchParams();
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
  const sortBy = (filters.sort ?? AnalyticsMetric.ENGAGEMENT) as
    | AnalyticsMetric.ENGAGEMENT
    | AnalyticsMetric.VIEWS
    | AnalyticsMetric.POSTS;
  const buildDetailHref = (brandId: string): string => {
    const query = searchParams.toString();
    return query
      ? `${basePath}/brands/${brandId}?${query}`
      : `${basePath}/brands/${brandId}`;
  };

  useEffect(() => {
    // Refresh nonce from analytics context: force refetch when refresh button is pressed
    if (refreshTrigger < 0) {
      return;
    }

    const controller = new AbortController();
    const fetchBrandsData = async () => {
      if (!isSignedIn) {
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
        const response = await service.getBrandsWithStats({
          endDate,
          limit: Math.min(ITEMS_PER_PAGE * 8, MAX_BRANDS_ANALYTICS_LIMIT),
          page: 1,
          sort: sortBy,
          startDate,
        });
        if (!controller.signal.aborted) setBrandsData(response.data);
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
  }, [isSignedIn, dateRange, refreshTrigger, sortBy, getAnalyticsService]);

  const filteredBrands = brandsData.filter((brand) =>
    brand.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

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
    <Table
      label="All Brands"
      description={`${filteredBrands.length} brand${filteredBrands.length !== 1 ? 's' : ''} found`}
      items={filteredBrands}
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
              {brand.logo ? (
                <Image
                  src={brand.logo}
                  alt={brand.name}
                  width={40}
                  height={40}
                  className="size-10 rounded-full object-cover"
                />
              ) : (
                <div className="size-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold text-lg">
                  {brand.name.charAt(0).toUpperCase()}
                </div>
              )}
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
          header: 'Posts',
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
          header: 'Views',
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
          header: 'Engagement',
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
          header: 'Eng. Rate',
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
      actions={[
        {
          icon: <ArrowRight className="size-4" />,
          onClick: (brand) => router.push(buildDetailHref(brand.id)),
          tooltip: 'View Brand Details',
        },
      ]}
    />
  );
}
