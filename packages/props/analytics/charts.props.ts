import type { AnalyticsMetric } from '@genfeedai/enums';
import type { PostPerformanceDataPoint } from '@genfeedai/interfaces/analytics/analytics-ui.interface';
import type { BrandPerformanceData } from '@services/analytics/analytics.service';

export interface PostPerformanceChartProps {
  data: PostPerformanceDataPoint[];
  isLoading?: boolean;
  height?: number;
  className?: string;
}

export type SocialPlatform =
  | 'instagram'
  | 'tiktok'
  | 'youtube'
  | 'facebook'
  | 'twitter'
  | 'linkedin'
  | 'reddit'
  | 'pinterest'
  | 'medium';

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
