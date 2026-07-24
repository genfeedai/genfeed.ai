'use client';

import { useAnalyticsContext } from '@contexts/analytics/analytics-context';
import { APP_ROUTES, ITEMS_PER_PAGE } from '@genfeedai/constants';
import { AnalyticsMetric, PageScope } from '@genfeedai/enums';
import {
  formatCompactNumberIntl,
  formatPercentageSimple,
} from '@helpers/formatting/format/format.helper';
import { getDateRangeWithDefaults } from '@helpers/utils/date-range.util';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useAnalytics } from '@hooks/data/analytics/use-analytics/use-analytics';
import type {
  BrandPerformanceData,
  IBrandWithStats,
  PlatformBreakdownData,
} from '@services/analytics/analytics.service';
import { AnalyticsService } from '@services/analytics/analytics.service';
import Card from '@ui/card/Card';
import { DashboardGrid } from '@ui/dashboard/DashboardGrid';
import { Skeleton } from '@ui/display/skeleton/skeleton';
import Table from '@ui/display/table/Table';
import { EmptyStateCard } from '@ui/feedback';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { HiArrowRight, HiBuildingOffice2 } from 'react-icons/hi2';

const BrandPerformanceChart = dynamic(
  () =>
    import(
      '@ui/analytics/charts/brand-performance/brand-performance-chart'
    ).then((mod) => mod.BrandPerformanceChart),
  {
    loading: () => <div className="h-chart w-full bg-muted/60 animate-pulse" />,
    ssr: false,
  },
);

const PlatformBreakdownChart = dynamic(
  () =>
    import(
      '@ui/analytics/charts/platform-breakdown/platform-breakdown-chart'
    ).then((mod) => mod.PlatformBreakdownChart),
  {
    loading: () => <div className="h-chart w-full bg-muted/60 animate-pulse" />,
    ssr: false,
  },
);

export interface AnalyticsOrganizationOverviewProps {
  organizationId?: string;
  basePath?: string;
}

interface OrganizationMetricCard {
  accent: string;
  label: string;
  value: string;
}

function formatGrowthAccent(
  growth: number | null | undefined,
  fallback: string,
): string {
  if (growth === null || growth === undefined) {
    return fallback;
  }

  return `${growth > 0 ? '+' : ''}${growth}% from last period`;
}

function OrganizationMetricStrip({
  analytics,
  isLoading,
}: {
  analytics: ReturnType<typeof useAnalytics>['analytics'];
  isLoading: boolean;
}) {
  const router = useRouter();

  const metrics: OrganizationMetricCard[] = [
    {
      accent: 'Active brands',
      label: 'Total Brands',
      value: formatCompactNumberIntl(analytics?.totalBrands),
    },
    {
      accent: 'Published content',
      label: 'Total Posts',
      value: formatCompactNumberIntl(analytics?.totalPosts),
    },
    {
      accent: formatGrowthAccent(analytics?.viewsGrowth, 'Total views'),
      label: 'Total Views',
      value: formatCompactNumberIntl(analytics?.totalViews),
    },
    {
      accent: 'Organization members',
      label: 'Total Members',
      value: formatCompactNumberIntl(analytics?.totalUsers),
    },
  ];

  // Once loaded, an org with no brands/posts/views/members has nothing to chart.
  // Show a real "create your first brand" next step instead of a strip of 0s.
  const hasNoData =
    !isLoading &&
    !analytics?.totalBrands &&
    !analytics?.totalPosts &&
    !analytics?.totalViews &&
    !analytics?.totalUsers;

  return (
    <section aria-labelledby="organization-metrics-heading">
      <h2
        id="organization-metrics-heading"
        className="mb-4 text-xl font-semibold tracking-[-0.02em] text-foreground"
      >
        Organization Metrics
      </h2>

      {hasNoData ? (
        <EmptyStateCard
          icon={HiBuildingOffice2}
          title="No organization activity yet"
          description="Create your first brand to start publishing content and tracking performance across your organization."
          action={{
            label: 'Create your first brand',
            onClick: () => router.push(APP_ROUTES.ONBOARDING.BRAND),
          }}
        />
      ) : (
        <DashboardGrid>
          {metrics.map((metric) => (
            <Card key={metric.label} bodyClassName="p-4">
              {isLoading ? (
                <Skeleton variant="text" height={32} className="w-16" />
              ) : (
                <div className="text-2xl font-semibold tracking-[-0.02em] text-foreground">
                  {metric.value}
                </div>
              )}
              <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.14em] text-foreground/55">
                {metric.label}
              </p>
              {isLoading ? (
                <Skeleton variant="text" height={12} className="mt-2 w-28" />
              ) : (
                <p className="mt-1.5 text-[11px] text-foreground/45">
                  {metric.accent}
                </p>
              )}
            </Card>
          ))}
        </DashboardGrid>
      )}
    </section>
  );
}

export default function AnalyticsOrganizationOverview({
  basePath = '/analytics',
}: AnalyticsOrganizationOverviewProps) {
  const { isSignedIn } = useAuthIdentity();
  const router = useRouter();
  const { dateRange, brandId } = useAnalyticsContext();
  const { startDate, endDate } = getDateRangeWithDefaults(
    dateRange?.startDate ?? undefined,
    dateRange?.endDate ?? undefined,
  );
  const { analytics, isLoading } = useAnalytics({
    autoLoad: true,
    endDate,
    scope: PageScope.ORGANIZATION,
    startDate,
  });

  const getAnalyticsService = useAuthedService((token: string) =>
    AnalyticsService.getInstance(token),
  );

  const [brandsData, setBrandsData] = useState<IBrandWithStats[]>([]);
  const [loadingBrands, setLoadingBrands] = useState(false);
  const [platformData, setPlatformData] = useState<PlatformBreakdownData[]>([]);
  const [loadingPlatform, setLoadingPlatform] = useState(false);

  useEffect(() => {
    const fetchBrandsData = async () => {
      // Don't fetch if not signed in (prevents API calls during logout)
      if (!isSignedIn) {
        return;
      }
      if (!dateRange.startDate || !dateRange.endDate) {
        return;
      }

      setLoadingBrands(true);
      try {
        const service = await getAnalyticsService();
        const response = await service.getBrandsWithStats({
          endDate,
          limit: ITEMS_PER_PAGE,
          page: 1,
          sort: AnalyticsMetric.ENGAGEMENT,
          startDate,
        });
        setBrandsData(response.data);
      } catch {
        // Error handling
      } finally {
        setLoadingBrands(false);
      }
    };

    fetchBrandsData();
  }, [isSignedIn, dateRange, getAnalyticsService, endDate, startDate]);

  useEffect(() => {
    const fetchPlatformData = async () => {
      // Don't fetch if not signed in (prevents API calls during logout)
      if (!isSignedIn) {
        return;
      }

      setLoadingPlatform(true);
      try {
        const service = await getAnalyticsService();
        const response = (await service.getPlatformComparison({
          brand: brandId,
          endDate,
          startDate,
        })) as Record<string, { posts?: number; views?: number }>;

        // Transform response to PlatformBreakdownData format
        const transformed = Object.entries(response).map(
          ([platform, data]) => ({
            platform,
            posts: data.posts || 0,
            value: data.views || 0,
          }),
        );

        setPlatformData(transformed);
      } catch {
        // Error handling
      } finally {
        setLoadingPlatform(false);
      }
    };

    fetchPlatformData();
  }, [isSignedIn, getAnalyticsService, brandId, startDate, endDate]);

  const brandChartData: BrandPerformanceData[] = brandsData.map((brand) => ({
    engagement: brand.totalEngagement,
    name: brand.name,
    posts: brand.totalPosts,
    views: brand.totalViews,
  }));

  function getGrowthClass(growth: number): string {
    if (growth > 0) {
      return 'text-success';
    }
    if (growth < 0) {
      return 'text-error';
    }
    return '';
  }

  return (
    <div className="space-y-6">
      <OrganizationMetricStrip analytics={analytics} isLoading={isLoading} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <BrandPerformanceChart
          data={brandChartData}
          isLoading={loadingBrands}
          height={300}
        />
        <PlatformBreakdownChart
          data={platformData}
          metric={AnalyticsMetric.VIEWS}
          isLoading={loadingPlatform}
          height={300}
        />
      </div>

      <div className="bg-background p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">
            All Brands ({brandsData.length})
          </h3>
        </div>

        <div className="overflow-x-auto">
          <Table
            items={brandsData}
            isLoading={loadingBrands}
            emptyLabel="No brands found"
            getRowKey={(brand) => brand.id}
            onRowClick={(brand) => router.push(`/analytics/brands/${brand.id}`)}
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
                        width={32}
                        height={32}
                        className="size-8 rounded-full object-cover"
                      />
                    ) : (
                      <div className="size-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold">
                        {brand.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div className="font-medium">{brand.name}</div>
                      <div className="text-xs text-foreground/60">
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
                  <span className="font-mono">
                    {formatCompactNumberIntl(brand.totalPosts)}
                  </span>
                ),
              },
              {
                header: 'Views',
                key: 'totalViews',
                render: (brand) => (
                  <span className="font-mono">
                    {formatCompactNumberIntl(brand.totalViews)}
                  </span>
                ),
              },
              {
                header: 'Engagement',
                key: 'totalEngagement',
                render: (brand) => (
                  <span className="font-mono">
                    {formatCompactNumberIntl(brand.totalEngagement)}
                  </span>
                ),
              },
              {
                header: 'Eng. Rate',
                key: 'avgEngagementRate',
                render: (brand) => (
                  <span className="font-mono">
                    {formatPercentageSimple(brand.avgEngagementRate, 2)}
                  </span>
                ),
              },
              {
                header: 'Growth',
                key: 'growth',
                render: (brand) => (
                  <span className={`font-mono ${getGrowthClass(brand.growth)}`}>
                    {brand.growth > 0 ? '+' : ''}
                    {formatPercentageSimple(brand.growth, 2)}
                  </span>
                ),
              },
            ]}
            actions={[
              {
                icon: <HiArrowRight className="size-4" />,
                onClick: (brand) =>
                  router.push(`${basePath}/brands/${brand.id}`),
                tooltip: 'View Details',
              },
            ]}
          />
        </div>
      </div>
    </div>
  );
}
