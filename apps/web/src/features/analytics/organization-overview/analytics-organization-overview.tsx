'use client';
import { useAnalyticsContext } from '@contexts/analytics/analytics-context';
import { AnalyticsMetric, PageScope } from '@genfeedai/contracts';
import { APP_ROUTES, ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';
import {
  formatCompactNumberIntl,
  formatPercentageSimple,
} from '@helpers/formatting/format/format.helper';
import { getDateRangeWithDefaults } from '@helpers/utils/date-range.util';
import { useAuthIdentity } from '@hooks/auth/use-auth-identity/use-auth-identity';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import {
  isCollectionFetchReady,
  useCollectionScope,
} from '@hooks/navigation/use-collection-scope/use-collection-scope';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import type {
  BrandPerformanceData,
  IBrandWithStats,
  PlatformBreakdownData,
} from '@services/analytics/analytics.service';
import { AnalyticsService } from '@services/analytics/analytics.service';
import { logger } from '@services/core/logger.service';
import { OrganizationsService } from '@services/organization/organizations.service';
import { AnalyticsMetricLabel } from '@ui/analytics/metric-definition/AnalyticsMetricInfo';
import MetricCard from '@ui/cards/metric-card/MetricCard';
import { DashboardGrid } from '@ui/dashboard/DashboardGrid';
import Table from '@ui/display/table/Table';
import { BrandAvatar } from '@ui/primitives/brand-avatar';
import { EmptyState, type EmptyStateAction } from '@ui/primitives/empty-state';
import { Skeleton } from '@ui/primitives/skeleton';
import { Building2 } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { WorkspaceSurface } from '@/components/overview/WorkspaceSurface';
import AnalyticsTopAccounts from '@/features/analytics/accounts/analytics-top-accounts';
import AnalyticsBrandSummary from '@/features/analytics/brands-list/analytics-brand-summary';
import { useAnalytics } from '@/hooks/data/analytics/use-analytics/use-analytics';

const BrandPerformanceChart = dynamic(
  () =>
    import(
      '@/features/analytics/components/analytics/charts/brand-performance/brand-performance-chart'
    ).then((mod) => mod.BrandPerformanceChart),
  {
    loading: () => <Skeleton className="h-chart w-full" />,
    ssr: false,
  },
);

const PlatformBreakdownChart = dynamic(
  () =>
    import(
      '@/features/analytics/components/analytics/charts/platform-breakdown/platform-breakdown-chart'
    ).then((mod) => mod.PlatformBreakdownChart),
  {
    loading: () => <Skeleton className="h-chart w-full" />,
    ssr: false,
  },
);

export interface AnalyticsOrganizationOverviewProps {
  organizationId?: string;
  basePath?: string;
}

interface OrganizationMetricCard {
  analyticsMetric?: 'posts' | 'views';
  label: string;
  trend?: number;
  value: string;
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
      label: 'Total Brands',
      value: formatCompactNumberIntl(analytics?.totalBrands),
    },
    {
      analyticsMetric: 'posts',
      label: 'Total Posts',
      value: formatCompactNumberIntl(analytics?.totalPosts),
    },
    {
      analyticsMetric: 'views',
      label: 'Total Views',
      trend: analytics?.viewsGrowth ?? undefined,
      value: formatCompactNumberIntl(analytics?.totalViews),
    },
    {
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

  // Breadcrumb already owns page identity (Workspace / Overview) — no extra
  // "Organization Metrics" page title.
  if (hasNoData) {
    return (
      <EmptyState
        surface="card"
        icon={Building2}
        title="No organization activity yet"
        action={{
          label: 'Create your first brand',
          onClick: () => router.push(APP_ROUTES.ONBOARDING.BRAND),
        }}
      />
    );
  }

  return (
    <section aria-label="Organization metrics">
      <DashboardGrid>
        {metrics.map((metric) => (
          <MetricCard
            key={metric.label}
            analyticsMetric={metric.analyticsMetric}
            isLoading={isLoading}
            label={metric.label}
            trend={metric.trend}
            value={metric.value}
          />
        ))}
      </DashboardGrid>
    </section>
  );
}

export default function AnalyticsOrganizationOverview({
  basePath = '/analytics',
  organizationId: organizationIdProp,
}: AnalyticsOrganizationOverviewProps) {
  const { isSignedIn } = useAuthIdentity();
  const router = useRouter();
  const translateCharts = useTranslations('ui.analyticsCharts');
  const { orgHref } = useOrgUrl();
  const scope = useCollectionScope();
  const organizationId = organizationIdProp ?? scope.organizationId;
  // The brand context resolves the org id asynchronously. Fetching before it
  // lands puts `organizationId=` on the wire and the query DTO rejects it.
  const isFetchReady =
    Boolean(organizationIdProp) || isCollectionFetchReady(scope);
  const { dateRange, brandId } = useAnalyticsContext();
  const { startDate, endDate } = getDateRangeWithDefaults(
    dateRange?.startDate ?? undefined,
    dateRange?.endDate ?? undefined,
  );
  // The organization on screen, not the viewer's own: without `scopeId` the
  // hook falls back to the signed-in user's active organization, so a platform
  // admin opening someone else's organization saw their own numbers.
  const { analytics, isLoading } = useAnalytics({
    autoLoad: true,
    endDate,
    scope: PageScope.ORGANIZATION,
    scopeId: organizationId,
    startDate,
  });

  const hasDateRange = Boolean(dateRange.startDate && dateRange.endDate);
  const brandsQuery = useAuthedQuery({
    enabled: isSignedIn && isFetchReady && hasDateRange,
    queryFn: async (service) => {
      try {
        const response = await service.getBrandsWithStats({
          endDate,
          limit: ITEMS_PER_PAGE,
          organizationId,
          page: 1,
          sort: AnalyticsMetric.ENGAGEMENT,
          startDate,
        });
        return response.data;
      } catch (error) {
        logger.error('Failed to fetch organization brand analytics', error);
        throw error;
      }
    },
    queryKey: [
      'analytics',
      'organization-brands',
      organizationId,
      startDate,
      endDate,
    ],
    service: (token: string) => AnalyticsService.getInstance(token),
  });
  const brandsData: IBrandWithStats[] = brandsQuery.data ?? [];
  // Loading from the first paint until data is cached: a scope that is not
  // ready yet or a read in flight, never the empty table first.
  const loadingBrands = brandsQuery.data === undefined && !brandsQuery.isError;

  const platformQuery = useAuthedQuery({
    enabled: isSignedIn && isFetchReady && Boolean(organizationId),
    queryFn: async (service) => {
      try {
        const platforms = await service.findOrganizationAnalyticsPlatforms(
          organizationId,
          { brandId: brandId || undefined, endDate, startDate },
        );
        return platforms.map(
          (row): PlatformBreakdownData => ({
            platform: row.platform,
            posts: row.postCount,
            value: row.views,
          }),
        );
      } catch (error) {
        logger.error('Failed to fetch organization platform analytics', error);
        throw error;
      }
    },
    queryKey: [
      'analytics',
      'organization-platforms',
      organizationId,
      brandId ?? null,
      startDate,
      endDate,
    ],
    service: (token: string) => OrganizationsService.getInstance(token),
  });
  const platformData: PlatformBreakdownData[] = platformQuery.data ?? [];
  const loadingPlatform =
    platformQuery.data === undefined && !platformQuery.isError;

  // Accounts are connected per brand from the brands settings page. A platform
  // admin viewing another organization gets no action: the link would open
  // their own organization's settings.
  const connectAccountsAction: EmptyStateAction | undefined = organizationIdProp
    ? undefined
    : {
        label: translateCharts('connectAccounts'),
        onClick: () => router.push(orgHref(APP_ROUTES.SETTINGS.BRANDS)),
      };

  const brandChartData: BrandPerformanceData[] = brandsData.map((brand) => ({
    engagement: brand.totalEngagement,
    name: brand.name,
    posts: brand.totalPosts,
    views: brand.totalViews,
  }));
  // Published posts with no views means metrics have not synced yet, so
  // pointing at account setup would send people to the wrong fix.
  const hasPublishedPosts = brandChartData.some((brand) => brand.posts > 0);

  function getGrowthClass(growth: number): string {
    if (growth > 0) {
      return 'text-success';
    }
    if (growth < 0) {
      return 'text-destructive';
    }
    return '';
  }

  return (
    <div className="space-y-6">
      <OrganizationMetricStrip analytics={analytics} isLoading={isLoading} />
      <AnalyticsTopAccounts organizationId={organizationId} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <BrandPerformanceChart
          data={brandChartData}
          emptyAction={connectAccountsAction}
          isLoading={loadingBrands}
          height={300}
        />
        <PlatformBreakdownChart
          data={platformData}
          emptyAction={hasPublishedPosts ? undefined : connectAccountsAction}
          metric={AnalyticsMetric.VIEWS}
          isLoading={loadingPlatform}
          height={300}
        />
      </div>

      <WorkspaceSurface
        density="compact"
        flush
        tone="outlined"
        title={`All Brands (${formatCompactNumberIntl(analytics?.totalBrands)})`}
      >
        <Table
          framed={false}
          items={brandsData}
          isLoading={loadingBrands}
          emptyLabel="No brands found"
          getRowKey={(brand) => brand.id}
          getRowLink={(brand) => ({
            href: `${basePath}/brands/${brand.id}`,
            label: `Open ${brand.name} analytics`,
          })}
          rowSidebar={{
            getId: (brand) => brand.id,
            getSubtitle: (brand) => brand.organizationName,
            getTitle: (brand) => brand.name,
            kind: 'brand',
            render: (brand) => (
              <AnalyticsBrandSummary
                brand={brand}
                openHref={`${basePath}/brands/${brand.id}`}
              />
            ),
          }}
          columns={[
            {
              header: 'Brand',
              key: 'name',
              render: (brand) => (
                <div className="flex items-center gap-3">
                  <BrandAvatar
                    alt={brand.name}
                    name={brand.name}
                    size="lg"
                    src={brand.logo}
                  />
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
              className: 'text-right tabular-nums',
              header: (
                <AnalyticsMetricLabel metric="posts">
                  Posts
                </AnalyticsMetricLabel>
              ),
              key: 'totalPosts',
              render: (brand) => (
                <span className="font-medium">
                  {formatCompactNumberIntl(brand.totalPosts)}
                </span>
              ),
            },
            {
              className: 'text-right tabular-nums',
              header: (
                <AnalyticsMetricLabel metric="views">
                  Views
                </AnalyticsMetricLabel>
              ),
              key: 'totalViews',
              render: (brand) => (
                <span className="font-medium">
                  {formatCompactNumberIntl(brand.totalViews)}
                </span>
              ),
            },
            {
              className: 'text-right tabular-nums',
              header: (
                <AnalyticsMetricLabel metric="engagement">
                  Engagement
                </AnalyticsMetricLabel>
              ),
              key: 'totalEngagement',
              render: (brand) => (
                <span className="font-medium">
                  {formatCompactNumberIntl(brand.totalEngagement)}
                </span>
              ),
            },
            {
              className: 'text-right tabular-nums',
              header: (
                <AnalyticsMetricLabel metric="engagementRate">
                  Eng. Rate
                </AnalyticsMetricLabel>
              ),
              key: 'avgEngagementRate',
              render: (brand) => (
                <span className="font-medium">
                  {formatPercentageSimple(brand.avgEngagementRate, 2)}
                </span>
              ),
            },
            {
              className: 'text-right tabular-nums',
              header: 'Growth',
              key: 'growth',
              render: (brand) => (
                <span className={`font-medium ${getGrowthClass(brand.growth)}`}>
                  {brand.growth > 0 ? '+' : ''}
                  {formatPercentageSimple(brand.growth, 2)}
                </span>
              ),
            },
          ]}
        />
      </WorkspaceSurface>
    </div>
  );
}
