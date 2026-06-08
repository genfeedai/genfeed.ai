'use client';

import { useAnalyticsContext } from '@contexts/analytics/analytics-context';
import { ITEMS_PER_PAGE } from '@genfeedai/constants';
import { PageScope, PostStatus } from '@genfeedai/enums';
import type { IAnalytics } from '@genfeedai/interfaces';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { Post } from '@models/content/post.model';
import PostDetailOverlay from '@pages/posts/detail/PostDetailOverlay';
import type { PlatformComparisonData } from '@props/analytics/analytics.props';
import type { PlatformTimeSeriesDataPoint } from '@props/analytics/charts.props';
import { logger } from '@services/core/logger.service';
import { BrandsService } from '@services/social/brands.service';
import Container from '@ui/layout/container/Container';
import { useEffect, useMemo, useState } from 'react';
import { HiOutlineChartBar } from 'react-icons/hi2';
import BrandChartsGrid from './BrandChartsGrid';
import BrandKPISection from './BrandKPISection';
import BrandTopPostsTable from './BrandTopPostsTable';

const BRAND_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

type PostWithAnalytics = Post & {
  totalViews?: number;
  totalLikes?: number;
  totalComments?: number;
  engagementRate?: number;
};

export interface AnalyticsBrandOverviewProps {
  basePath?: string;
  brandId: string;
}

export default function AnalyticsBrandOverview({
  basePath = '/analytics',
  brandId,
}: AnalyticsBrandOverviewProps) {
  const { dateRange } = useAnalyticsContext();

  const getBrandsService = useAuthedService((token: string) =>
    BrandsService.getInstance(token),
  );

  const [analytics, setAnalytics] = useState<IAnalytics | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [timeSeriesData, setTimeSeriesData] = useState<
    PlatformTimeSeriesDataPoint[]
  >([]);
  const [connectedPlatforms, setConnectedPlatforms] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingPosts, setIsLoadingPosts] = useState(false);
  const [isLoadingTimeSeries, setIsLoadingTimeSeries] = useState(false);
  const [brandName, setBrandName] = useState('');
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);

  useEffect(() => {
    const fetchAnalytics = async () => {
      setIsLoading(true);
      try {
        const service = await getBrandsService();
        const data = await service.findBrandAnalytics(brandId);
        setAnalytics(data);
        logger.info('Brand analytics fetched', { brandId, data });

        const brand = await service.findOne(brandId);
        setBrandName(brand.label);
      } catch (error) {
        logger.error('Failed to fetch brand analytics', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAnalytics();
  }, [brandId, getBrandsService]);

  useEffect(() => {
    const fetchPosts = async () => {
      setIsLoadingPosts(true);
      try {
        const service = await getBrandsService();
        const postsData = await service.findBrandPosts(brandId, {
          limit: ITEMS_PER_PAGE,
          page: 1,
          sort: '-createdAt',
        });
        setPosts(postsData);
      } catch {
        // Error handling
      } finally {
        setIsLoadingPosts(false);
      }
    };

    fetchPosts();
  }, [brandId, getBrandsService]);

  useEffect(() => {
    const fetchCredentials = async () => {
      try {
        const service = await getBrandsService();
        const credentials = await service.findBrandCredentials(brandId);
        const connected = credentials
          .filter((cred) => cred.isConnected)
          .flatMap((cred) =>
            cred.platform?.toLowerCase() ? [cred.platform.toLowerCase()] : [],
          );
        setConnectedPlatforms(connected);
      } catch {
        // Error handling
      }
    };

    fetchCredentials();
  }, [brandId, getBrandsService]);

  useEffect(() => {
    const fetchTimeSeries = async () => {
      if (!dateRange.startDate || !dateRange.endDate) {
        return;
      }

      setIsLoadingTimeSeries(true);

      try {
        const service = await getBrandsService();
        const data = (await service.findBrandAnalyticsTimeSeries(brandId, {
          endDate: dateRange.endDate?.toISOString().split('T')[0] || '',
          groupBy: 'day',
          startDate: dateRange.startDate?.toISOString().split('T')[0] || '',
        })) as PlatformTimeSeriesDataPoint[];
        setTimeSeriesData(data);
        logger.info('Time series data fetched', {
          brandId,
          dataLength: Array.isArray(data) ? data.length : 0,
        });
      } catch (error) {
        logger.error('Failed to fetch time series data', error);
        setTimeSeriesData([]);
      } finally {
        setIsLoadingTimeSeries(false);
      }
    };

    fetchTimeSeries();
  }, [brandId, dateRange, getBrandsService]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return BRAND_DATE_FORMATTER.format(date);
  };

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
    <Container
      label={`${brandName || 'Brand'} Analytics`}
      description="Performance metrics and content overview."
      icon={HiOutlineChartBar}
    >
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
          formatDate={formatDate}
          isLoadingPosts={isLoadingPosts}
          onSelectPost={setSelectedPostId}
          topPosts={topPosts}
        />
      </div>

      <PostDetailOverlay
        postId={selectedPostId}
        scope={PageScope.ANALYTICS}
        onClose={() => setSelectedPostId(null)}
      />
    </Container>
  );
}
