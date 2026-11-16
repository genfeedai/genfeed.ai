import type { AnalyticsMetric } from '@genfeedai/contracts';
import type { PlatformBreakdownData } from '@genfeedai/services/analytics/analytics.service';
import type { EmptyStateAction } from '@ui/primitives/empty-state';

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
  /** Next step shown when no platform has data in the range. */
  emptyAction?: EmptyStateAction;
}

export interface AnalyticsTopAccountsProps {
  organizationId?: string;
}

export interface PlatformBreakdownChartProps {
  data: PlatformBreakdownData[];
  title?: string;
  metric?: AnalyticsMetric.VIEWS | AnalyticsMetric.POSTS;
  isLoading?: boolean;
  height?: number;
  className?: string;
  /** Next step shown when no platform has reported views in the range. */
  emptyAction?: EmptyStateAction;
}
