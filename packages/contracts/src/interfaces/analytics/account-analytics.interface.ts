import type { AccountEvaluationEvidence } from '../../analytics/account-evaluation';
import type { AccountEvaluationState } from '../../enums/account-evaluation-state.enum';
import type { AnalyticsMetric } from '../../enums/analytics-metric.enum';
import type { AnalyticsMetricAvailability } from '../../enums/analytics-metric-availability.enum';
import type { Platform } from '../../enums/platform.enum';
import type { ITopContent } from './analytics.interface';

export interface IAccountMetricValue {
  availability: AnalyticsMetricAvailability;
  change: number | null;
  lifetime: number | null;
  metric: AnalyticsMetric;
}

export interface IAccountAnalyticsIdentity {
  brandId: string;
  brandLabel: string;
  connectedAt: string | null;
  credentialId: string;
  externalAvatar: string | null;
  externalHandle: string | null;
  externalId: string | null;
  externalName: string | null;
  firstPublishedAt: string | null;
  firstTrackedAt: string | null;
  isConnected: boolean;
  label: string | null;
  manageHref: string;
  platform: Platform;
}

export interface IAccountAnalytics {
  coverage: number;
  evaluation: {
    evidence: AccountEvaluationEvidence;
    state: AccountEvaluationState;
  } | null;
  freshnessHours: number | null;
  identity: IAccountAnalyticsIdentity;
  metrics: IAccountMetricValue[];
  publishedPosts: number;
}

export interface IAccountAnalyticsList {
  accounts: IAccountAnalytics[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  unattributedPostCount: number;
}

export interface IAccountAnalyticsSeriesPoint {
  date: string;
  metrics: IAccountMetricValue[];
}

export interface IAccountAnalyticsDetail extends IAccountAnalytics {
  growth: IAccountMetricValue[];
  series: IAccountAnalyticsSeriesPoint[];
  topPosts: ITopContent[];
}
