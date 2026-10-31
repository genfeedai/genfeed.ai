import type { AnalyticsMetric } from '@genfeedai/contracts';
import type { IEngagementBreakdown } from '@genfeedai/contracts/interfaces';
import type { IconComponent } from '@genfeedai/contracts/types/icon';
import type { PlatformBreakdownData } from '@genfeedai/services/analytics/analytics.service';

export interface AnalyticsTool {
  id: string;
  title: string;
  description: string;
  href: string;
  icon: IconComponent;
  comingSoon?: boolean;
}

export interface OrganizationAnalyticsDashboardProps {
  organizationId: string;
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

export interface AnalyticsTopAccountsProps {
  organizationId?: string;
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
