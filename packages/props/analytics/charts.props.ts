import type { AnalyticsMetric, Platform } from '@genfeedai/contracts';
import type { PostPerformanceDataPoint } from '@genfeedai/contracts/interfaces/analytics/analytics-ui.interface';
import type { BrandPerformanceData } from '@genfeedai/services/analytics/analytics.service';

export interface PostPerformanceChartProps {
  data: PostPerformanceDataPoint[];
  isLoading?: boolean;
  height?: number;
  className?: string;
}

/** Product {@link Platform} ids. Chart series keys stay lowercase enum values. */
export type SocialPlatform = Platform;

export interface PlatformTimeSeriesDataPoint {
  date: string;
  instagram?: number;
  tiktok?: number;
  youtube?: number;
  facebook?: number;
  twitter?: number;
  linkedin?: number;
  reddit?: number;
  pinterest?: number;
  medium?: number;
}

export interface PlatformTimeSeriesChartProps {
  data: PlatformTimeSeriesDataPoint[];
  platforms?: SocialPlatform[];
  isLoading?: boolean;
  height?: number;
  className?: string;
}

export interface BrandPerformanceChartProps {
  data: BrandPerformanceData[];
  title?: string;
  metric?:
    | AnalyticsMetric.VIEWS
    | AnalyticsMetric.ENGAGEMENT
    | AnalyticsMetric.POSTS;
  isLoading?: boolean;
  height?: number;
  className?: string;
}
