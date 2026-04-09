'use client';

import { useAnalyticsContext } from '@contexts/analytics/analytics-context';
import { ITEMS_PER_PAGE } from '@genfeedai/constants';
import { PageScope, PostStatus } from '@genfeedai/enums';
import type { IAnalytics } from '@genfeedai/interfaces';
import { getPublisherPostsHref } from '@helpers/content/posts.helper';
import { getPlatformIcon } from '@helpers/ui/platform-icon/platform-icon.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import type { Post } from '@models/content/post.model';
import PostDetailOverlay from '@pages/posts/detail/PostDetailOverlay';
import type { PlatformComparisonData } from '@props/analytics/analytics.props';
import type { PlatformTimeSeriesDataPoint } from '@props/analytics/charts.props';
import { logger } from '@services/core/logger.service';
import { BrandsService } from '@services/social/brands.service';
import Card from '@ui/card/Card';
import HtmlContent from '@ui/display/html-content/HtmlContent';
import Table from '@ui/display/table/Table';
import KPISection from '@ui/kpi/kpi-section/KPISection';
import Container from '@ui/layout/container/Container';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  HiArrowRight,
  HiChartBar,
  HiEye,
  HiFire,
  HiGlobeAlt,
  HiHeart,
  HiOutlineChartBar,
  HiVideoCamera,
} from 'react-icons/hi2';

const PlatformComparisonChart = dynamic(
  () =>
    import(
      '@ui/analytics/charts/platform-comparison/platform-comparison-chart'
    ).then((mod) => mod.PlatformComparisonChart),
  {
    loading: () => <div className="h-chart w-full bg-muted/60 animate-pulse" />,
    ssr: false,
  },
);

const PlatformTimeSeriesChart = dynamic(
  () =>
    import(
      '@ui/analytics/charts/platform-time-series/platform-time-series-chart'
    ).then((mod) => mod.PlatformTimeSeriesChart),
  {
    loading: () => <div className="h-chart w-full bg-muted/60 animate-pulse" />,
    ssr: false,
  },
);

type PostWithAnalytics = Post & {
  totalViews?: number;
  totalLikes?: number;
  totalComments?: number;
  engagementRate?: number;
};

export interface AnalyticsBrandOverviewProps {
  brandId: string;
}

export default function AnalyticsBrandOverview({
  brandId,
}: AnalyticsBrandOverviewProps) {
  const _router = useRouter();
  const { dateRange, refreshTrigger } = useAnalyticsContext();

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
          .map((cred) => cred.platform?.toLowerCase())
          .filter(Boolean) as string[];
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

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-US', { notation: 'compact' }).format(num);
  };

  const formatPercentage = (num: number) => {
    return `${num.toFixed(2)}%`;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat('en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(date);
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
        <KPISection
          title="Brand Performance"
          gridCols={{ desktop: 3, mobile: 1, tablet: 3 }}
          className="bg-background"
          isLoading={isLoading}
          items={[
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
              description: 'Publishing channels',
              icon: HiGlobeAlt,
              iconClassName: 'bg-white/10 text-foreground',
              label: 'Active Platforms',
              value: platformCount,
            },
            {
              description: 'Per content piece',
              icon: HiChartBar,
              iconClassName: 'bg-white/10 text-foreground',
              label: 'Avg Views/Post',
              value:
                analytics?.totalPosts && analytics?.totalViews
                  ? formatNumber(analytics.totalViews / analytics.totalPosts)
                  : 0,
            },
          ]}
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card label="Platform Comparison">
            <PlatformComparisonChart
              data={platformComparisonData}
              isLoading={isLoading}
              height={300}
            />
          </Card>

          <Card label="Performance Trends">
            <PlatformTimeSeriesChart
              data={timeSeriesData}
              platforms={
                connectedPlatforms.length > 0
                  ? (connectedPlatforms as Array<
                      | 'instagram'
                      | 'tiktok'
                      | 'youtube'
                      | 'twitter'
                      | 'facebook'
                      | 'linkedin'
                    >)
                  : []
              }
              isLoading={isLoadingTimeSeries}
              height={300}
            />
          </Card>
        </div>

        <Card
          label={`Recent Posts (Top 5)`}
          className="bg-background"
          headerAction={
            <Link
              href={getPublisherPostsHref({ status: PostStatus.PUBLIC })}
              className="text-sm text-primary hover:underline flex items-center gap-1"
            >
              View All
            </Link>
          }
        >
          <div className="overflow-x-auto">
            <Table
              items={topPosts}
              isLoading={isLoadingPosts}
              emptyLabel="No published posts found for this brand"
              getRowKey={(post) => post.id}
              onRowClick={(post) => setSelectedPostId(post.id)}
              columns={[
                {
                  header: 'Preview',
                  key: 'thumbnail',
                  render: (post) => {
                    const ingredient = post.ingredients?.[0];
                    const thumbnailUrl =
                      ingredient?.thumbnailUrl || ingredient?.ingredientUrl;
                    return (
                      <div className="flex items-center gap-3">
                        {thumbnailUrl ? (
                          <Image
                            src={thumbnailUrl}
                            alt="Post thumbnail"
                            width={64}
                            height={64}
                            className="w-16 h-16 object-cover"
                          />
                        ) : (
                          <div className="w-16 h-16 bg-muted flex items-center justify-center">
                            <HiVideoCamera className="w-6 h-6 text-foreground/30" />
                          </div>
                        )}
                        <div className="max-w-xs">
                          {post.description ? (
                            <HtmlContent
                              content={post.description}
                              className="font-medium line-clamp-2 text-sm"
                            />
                          ) : (
                            <div className="font-medium line-clamp-2 text-sm">
                              {ingredient?.metadataLabel || 'Untitled'}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  },
                },
                {
                  header: 'Platform',
                  key: 'platform',
                  render: (post) => (
                    <div className="flex items-center justify-center">
                      {getPlatformIcon(post.platform, 'w-5 h-5')}
                    </div>
                  ),
                },
                {
                  header: 'Published',
                  key: 'publishedAt',
                  render: (post) => (
                    <span className="text-sm">
                      {post.publishedAt ? formatDate(post.publishedAt) : '-'}
                    </span>
                  ),
                },
                {
                  header: 'Views',
                  key: 'totalViews',
                  render: (post) => {
                    const postWithAnalytics = post as PostWithAnalytics;
                    return (
                      <span className="font-mono font-semibold">
                        {formatNumber(postWithAnalytics.totalViews || 0)}
                      </span>
                    );
                  },
                },
                {
                  header: 'Likes',
                  key: 'totalLikes',
                  render: (post) => {
                    const postWithAnalytics = post as PostWithAnalytics;
                    return (
                      <span className="font-mono">
                        {formatNumber(postWithAnalytics.totalLikes || 0)}
                      </span>
                    );
                  },
                },
                {
                  header: 'Comments',
                  key: 'totalComments',
                  render: (post) => {
                    const postWithAnalytics = post as PostWithAnalytics;
                    return (
                      <span className="font-mono">
                        {formatNumber(postWithAnalytics.totalComments || 0)}
                      </span>
                    );
                  },
                },
                {
                  header: 'Eng. Rate',
                  key: 'engagementRate',
                  render: (post) => {
                    const postWithAnalytics = post as PostWithAnalytics;
                    return (
                      <span className="font-mono">
                        {formatPercentage(
                          postWithAnalytics.engagementRate || 0,
                        )}
                      </span>
                    );
                  },
                },
              ]}
              actions={[
                {
                  icon: <HiArrowRight className="w-4 h-4" />,
                  onClick: (post) => setSelectedPostId(post.id),
                  tooltip: 'View Post Details',
                },
              ]}
            />
          </div>
        </Card>
      </div>

      <PostDetailOverlay
        postId={selectedPostId}
        scope={PageScope.ANALYTICS}
        onClose={() => setSelectedPostId(null)}
      />
    </Container>
  );
}
