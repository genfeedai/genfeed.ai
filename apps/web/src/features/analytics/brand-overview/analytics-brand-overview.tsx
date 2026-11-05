'use client';

import { useAnalyticsContext } from '@contexts/analytics/analytics-context';
import { PageScope, PostStatus } from '@genfeedai/contracts';
import { ITEMS_PER_PAGE } from '@genfeedai/contracts/constants';
import type { IAnalytics } from '@genfeedai/contracts/interfaces';
import { useAuthedQuery } from '@hooks/auth/use-authed-query/use-authed-query';
import type { Post } from '@models/content/post.model';
import { logger } from '@services/core/logger.service';
import { BrandsService } from '@services/social/brands.service';
import Container from '@ui/layout/container/Container';
import { ChartColumn } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { PlatformComparisonData } from '@/features/analytics/props/analytics.props';
import PostDetailPanel from '@/features/posts/detail/PostDetailPanel';
import type { PlatformTimeSeriesDataPoint } from '@/props/analytics/charts.props';

import BrandChartsGrid from './BrandChartsGrid';
import BrandKPISection from './BrandKPISection';
import BrandTopPostsTable from './BrandTopPostsTable';

type PostWithAnalytics = Post & {
  totalViews?: number;
  totalLikes?: number;
  totalComments?: number;
  engagementRate?: number;
};

const EMPTY_POSTS: Post[] = [];
const EMPTY_PLATFORMS: string[] = [];
const EMPTY_SERIES: unknown[] = [];

function createBrandsService(token: string): BrandsService {
  return BrandsService.getInstance(token);
}

function toIsoDay(date: Date): string {
  return date.toISOString().split('T')[0] ?? '';
}

export interface AnalyticsBrandOverviewProps {
  basePath?: string;
  brandId: string;
}

export default function AnalyticsBrandOverview({
  basePath = '/analytics',
  brandId,
}: AnalyticsBrandOverviewProps) {
  const { dateRange, refreshTrigger } = useAnalyticsContext();
  const startDay = dateRange.startDate ? toIsoDay(dateRange.startDate) : null;
  const endDay = dateRange.endDate ? toIsoDay(dateRange.endDate) : null;
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);

  // Every section is cached per viewer and brand: coming back to a brand
  // paints what it showed last at once, and the analytics Refresh re-reads
  // each section in the background without bringing the skeletons back.
  const analyticsQuery = useAuthedQuery<BrandsService, IAnalytics>({
    queryFn: async (service) => {
      try {
        return await service.findBrandAnalytics(brandId);
      } catch (error) {
        logger.error('Failed to fetch brand analytics', error);
        throw error;
      }
    },
    queryKey: ['analytics', 'brand-overview', brandId],
    refreshKey: refreshTrigger,
    service: createBrandsService,
  });

  const brandQuery = useAuthedQuery<BrandsService, string>({
    queryFn: async (service) => {
      try {
        return (await service.findOne(brandId)).label;
      } catch (error) {
        logger.error('Failed to fetch brand for analytics', error);
        throw error;
      }
    },
    queryKey: ['analytics', 'brand-overview-label', brandId],
    service: createBrandsService,
  });

  const postsQuery = useAuthedQuery<BrandsService, Post[]>({
    queryFn: async (service) => {
      try {
        return await service.findBrandPosts(brandId, {
          limit: ITEMS_PER_PAGE,
          page: 1,
          sort: '-createdAt',
        });
      } catch (error) {
        logger.error('Failed to fetch brand posts', error);
        throw error;
      }
    },
    queryKey: ['analytics', 'brand-overview-posts', brandId, ITEMS_PER_PAGE],
    refreshKey: refreshTrigger,
    service: createBrandsService,
  });

  const platformsQuery = useAuthedQuery<BrandsService, string[]>({
    queryFn: async (service) => {
      try {
        const credentials = await service.findBrandCredentials(brandId);
        return credentials
          .filter((cred) => cred.isConnected)
          .flatMap((cred) =>
            cred.platform?.toLowerCase() ? [cred.platform.toLowerCase()] : [],
          );
      } catch (error) {
        logger.error('Failed to fetch brand credentials', error);
        throw error;
      }
    },
    queryKey: ['analytics', 'brand-overview-platforms', brandId],
    service: createBrandsService,
  });

  // The same daily series the brands-list sidebar reads, so opening a brand
  // from the list paints its trend chart from that cache. A new range keeps
  // the current chart on screen while it loads.
  const seriesScopeKey = ['analytics', 'brand-sidebar-series', brandId];
  const seriesQuery = useAuthedQuery<BrandsService, unknown[]>({
    enabled: Boolean(startDay && endDay),
    keepPreviousDataWithin: seriesScopeKey,
    queryFn: async (service) => {
      try {
        return await service.findBrandAnalyticsTimeSeries(brandId, {
          endDate: endDay ?? '',
          groupBy: 'day',
          startDate: startDay ?? '',
        });
      } catch (error) {
        logger.error('Failed to fetch time series data', error);
        throw error;
      }
    },
    queryKey: [...seriesScopeKey, startDay, endDay],
    refreshKey: refreshTrigger,
    service: createBrandsService,
  });

  const analytics = analyticsQuery.data ?? null;
  const brandName = brandQuery.data ?? '';
  const posts = postsQuery.data ?? EMPTY_POSTS;
  const connectedPlatforms = platformsQuery.data ?? EMPTY_PLATFORMS;
  const timeSeriesData = (seriesQuery.data ??
    EMPTY_SERIES) as PlatformTimeSeriesDataPoint[];
  // A section shows its skeleton only while it has nothing to show yet.
  const isLoading = analyticsQuery.isPending;
  const isLoadingPosts = postsQuery.isPending;
  const isLoadingTimeSeries = seriesQuery.isPending;

  const platformCount = analytics
    ? Object.keys(analytics).filter((key) =>
        ['instagram', 'tiktok', 'youtube', 'twitter', 'facebook'].includes(key),
      ).length
    : 0;

  const platformComparisonData: PlatformComparisonData[] = useMemo(() => {
    if (!analytics) {
      return [];
    }

    const data = Object.entries(analytics)
      .filter(([key]) =>
        ['instagram', 'tiktok', 'youtube', 'twitter', 'facebook'].includes(key),
      )
      .map(([platform, data]: [string, Record<string, number>]) => ({
        comments: data?.totalComments || 0,
        likes: data?.totalLikes || 0,
        platform,
        posts: data?.totalPosts || 0,
        shares: data?.totalShares || 0,
        views: data?.totalViews || 0,
      }))
      .filter((p) => p.posts > 0);

    logger.info('Platform comparison data transformed', {
      brandId,
      platformCount: data.length,
      platforms: data.map((p) => p.platform),
    });

    return data;
  }, [analytics, brandId]);

  const publishedPosts = useMemo(() => {
    const publishedStatuses = [
      PostStatus.PUBLIC,
      PostStatus.PRIVATE,
      PostStatus.UNLISTED,
    ];
    return posts.filter((post) =>
      publishedStatuses.includes(post.status as PostStatus),
    );
  }, [posts]);

  const topPosts = useMemo(() => {
    return publishedPosts
      .sort((a, b) => {
        const aViews = (a as PostWithAnalytics).totalViews || 0;
        const bViews = (b as PostWithAnalytics).totalViews || 0;
        if (bViews !== aViews) {
          return bViews - aViews;
        }
        const aLikes = (a as PostWithAnalytics).totalLikes || 0;
        const bLikes = (b as PostWithAnalytics).totalLikes || 0;
        return bLikes - aLikes;
      })
      .slice(0, 5);
  }, [publishedPosts]);

  return (
    <Container label={`${brandName || 'Brand'} Analytics`} icon={ChartColumn}>
      <div className="space-y-6">
        <BrandKPISection
          analytics={analytics}
          isLoading={isLoading}
          platformCount={platformCount}
        />

        <BrandChartsGrid
          basePath={basePath}
          brandId={brandId}
          connectedPlatforms={connectedPlatforms}
          isLoading={isLoading}
          isLoadingTimeSeries={isLoadingTimeSeries}
          platformComparisonData={platformComparisonData}
          timeSeriesData={timeSeriesData}
        />

        <BrandTopPostsTable
          isLoadingPosts={isLoadingPosts}
          onSelectPost={setSelectedPostId}
          topPosts={topPosts}
        />
      </div>

      <PostDetailPanel
        postId={selectedPostId}
        scope={PageScope.ANALYTICS}
        onClose={() => setSelectedPostId(null)}
      />
    </Container>
  );
}
