import { AnalyticsMetric } from '@genfeedai/enums';
import type { IconType } from 'react-icons';

export interface AnalyticsStat {
  label: string;
  value: string;
  icon: IconType;
  accent: string;
}

export interface PostPerformanceDataPoint {
  timestamp: string;
  views: number;
  engagement: number;
}

export type BrandPerformanceMetricType =
  | AnalyticsMetric.VIEWS
  | AnalyticsMetric.ENGAGEMENT
  | AnalyticsMetric.POSTS;

export type PlatformComparisonMetricType =
  | AnalyticsMetric.VIEWS
  | AnalyticsMetric.LIKES
  | AnalyticsMetric.COMMENTS
  | AnalyticsMetric.SHARES;
