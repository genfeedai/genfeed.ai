import type { TargetAnalyticsCapability } from '@genfeedai/enums';

export interface SchedulerAnalyticsCapability {
  freshnessWindowMs: number | null;
  status: TargetAnalyticsCapability;
}
