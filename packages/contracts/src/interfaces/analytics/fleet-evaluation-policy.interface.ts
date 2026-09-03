import type { AnalyticsMetric } from '../../enums/analytics-metric.enum';
import type { Platform } from '../../enums/platform.enum';

export interface IFleetEvaluationPolicy {
  healthyMin: number;
  isEnabled: boolean;
  metric: AnalyticsMetric;
  minPublishedPosts: number;
  version: number;
  watchMin: number;
  windowWeeks: number;
  brandOverrides?: Record<string, Partial<IFleetEvaluationPolicy>>;
  platformPolicies?: Partial<Record<Platform, Partial<IFleetEvaluationPolicy>>>;
}
