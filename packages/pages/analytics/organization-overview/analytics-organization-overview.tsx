'use client';

import { useAuth } from '@clerk/nextjs';
import { useAnalyticsContext } from '@contexts/analytics/analytics-context';
import { ITEMS_PER_PAGE } from '@genfeedai/constants';
import { AnalyticsMetric, PageScope } from '@genfeedai/enums';
import {
  formatCompactNumberIntl,
  formatPercentageSimple,
} from '@helpers/formatting/format/format.helper';
import { getDateRangeWithDefaults } from '@helpers/utils/date-range.util';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useAnalytics } from '@hooks/data/analytics/use-analytics/use-analytics';
import type {
  BrandPerformanceData,
  IBrandWithStats,
  PlatformBreakdownData,
} from '@services/analytics/analytics.service';
import { AnalyticsService } from '@services/analytics/analytics.service';
import Table from '@ui/display/table/Table';
import KPISection from '@ui/kpi/kpi-section/KPISection';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  HiArrowRight,
  HiBuildingStorefront,
  HiEye,
  HiFire,
  HiHeart,
  HiUserGroup,
  HiVideoCamera,
} from 'react-icons/hi2';

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

export default function AnalyticsOrganizationOverview({
  basePath = '/analytics',
}: AnalyticsOrganizationOverviewProps) {
  const { isSignedIn } = useAuth();
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
      <KPISection
        title="Organization Metrics"
        gridCols={{ desktop: 3, mobile: 1, tablet: 3 }}
        className="bg-background"
        isLoading={isLoading}
        items={[
          {
            description: 'Active brands',
            icon: HiBuildingStorefront,
            iconClassName: 'bg-white/10 text-foreground',
            label: 'Total Brands',
            value: analytics?.totalBrands || 0,
          },
          {
            description: 'Published content',
            icon: HiVideoCamera,
            iconClassName: 'bg-white/10 text-foreground',
            label: 'Total Posts',
            value: analytics?.totalPosts || 0,
          },
          {
            description: analytics?.viewsGrowth
              ? `${analytics.viewsGrowth > 0 ? '+' : ''}${analytics.viewsGrowth}% from last period`
              : 'Total views',
            icon: HiEye,
            iconClassName: 'bg-white/10 text-foreground',
            label: 'Total Views',
            value: analytics?.totalViews || 0,
          },
          {
            description: analytics?.engagementGrowth
              ? `${analytics.engagementGrowth > 0 ? '+' : ''}${analytics.engagementGrowth}% from last period`
              : 'Total engagement',
            icon: HiHeart,
            iconClassName: 'bg-white/10 text-foreground',
            label: 'Total Engagement',
            value: analytics?.totalEngagement || analytics?.totalLikes || 0,
          },
          {
            description: 'Average engagement rate',
            icon: HiFire,
            iconClassName: 'bg-white/10 text-foreground',
            label: 'Engagement Rate',
            value: analytics?.avgEngagementRate
              ? `${analytics.avgEngagementRate.toFixed(2)}%`
              : '0%',
          },
          {
            description: 'Organization members',
            icon: HiUserGroup,
            iconClassName: 'bg-white/10 text-foreground',
            label: 'Total Members',
            value: analytics?.totalUsers || 0,
          },
        ]}
      />

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
                        className="w-8 h-8 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-semibold">
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
                icon: <HiArrowRight className="w-4 h-4" />,
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
