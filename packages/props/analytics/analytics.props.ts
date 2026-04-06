import type { AnalyticsMetric, Timeframe } from '@genfeedai/enums';
import type {
  IEngagementBreakdown,
  IGrowthTrends,
  ITimeSeriesDataPoint,
} from '@genfeedai/interfaces';
import type { PlatformBreakdownData } from '@services/analytics/analytics.service';
import type { ComponentType } from 'react';

export interface AnalyticsTool {
  id: string;
  title: string;
  description: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  comingSoon?: boolean;
}

export interface PostAnalyticsDashboardProps {
  publicationId?: string;
  className?: string;
}

export interface OrganizationAnalyticsDashboardProps {
  organizationId: string;
}

export interface PlatformAnalyticsBreakdownProps {
  analytics: Array<{
    id: string;
    label: string;
    platform: string;
    summary: {
      totalViews: number;
      totalLikes: number;
      totalComments: number;
      totalShares: number;
      avgEngagementRate: number;
      publicationCount: number;
    };
  }>;
  className?: string;
}

export interface PostsAnalyticsTableProps {
  publicationAnalytics: Array<{
    id: string;
    label: string;
    platform: string;
    summary: {
      totalViews: number;
      totalLikes: number;
      totalComments: number;
      totalShares: number;
      avgEngagementRate: number;
    };
  }>;
  isLoading?: boolean;
  onViewDetails?: (publicationId: string) => void;
  className?: string;
}

export interface AnalyticsOverviewProps {
  analytics: Array<{
    id?: string;
    label?: string;
    platform?: string;
    summary: {
      totalViews: number;
      totalLikes: number;
      totalComments: number;
      totalShares: number;
      avgEngagementRate: number;
    };
  }>;
  isLoading?: boolean;
  showPostsCount?: boolean;
  className?: string;
}

export interface GrowthTrendsCardProps {
  growthData: IGrowthTrends | null;
  timeframe?: Timeframe.D7 | Timeframe.D30 | Timeframe.D90;
  isLoading?: boolean;
  className?: string;
}

export interface EngagementBreakdownChartProps {
  breakdown: IEngagementBreakdown | null;
  isLoading?: boolean;
  height?: number;
  className?: string;
}

export interface PlatformComparisonData {
  platform: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  posts?: number;
}

export interface PlatformComparisonChartProps {
  data: PlatformComparisonData[];
  isLoading?: boolean;
  height?: number;
  className?: string;
}

export interface TimeSeriesChartProps {
  data: ITimeSeriesDataPoint[];
  metrics?: Array<
    | AnalyticsMetric.VIEWS
    | AnalyticsMetric.LIKES
    | AnalyticsMetric.COMMENTS
    | AnalyticsMetric.SHARES
    | AnalyticsMetric.SAVES
    | AnalyticsMetric.ENGAGEMENT_RATE
  >;
  isLoading?: boolean;
  height?: number;
  className?: string;
}

export interface BrandOverviewProps {
  brandId: string;
}

export interface PlatformDetailProps {
  brandId: string;
  platform: string;
}

export interface PostDetailProps {
  brandId: string;
  platform: string;
  postId: string;
}

export interface PlatformBreakdownChartProps {
  data: PlatformBreakdownData[];
  title?: string;
  metric?: AnalyticsMetric.VIEWS | AnalyticsMetric.POSTS;
  isLoading?: boolean;
  height?: number;
  className?: string;
}
