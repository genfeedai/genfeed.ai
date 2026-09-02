import type { TargetAnalyticsCapability } from '../..';

export interface SchedulerAnalyticsCapability {
  freshnessWindowMs: number | null;
  status: TargetAnalyticsCapability;
}
