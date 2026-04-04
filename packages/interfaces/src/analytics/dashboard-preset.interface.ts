import type {
  AgentDashboardOperation,
  AgentUIBlock,
} from '../ai/agent-ui-block.interface';
import type { IAnalytics } from './analytics.interface';

export type DashboardScopePreset = 'organization' | 'brand' | 'superadmin';

export type DashboardKpiValueFormat = 'number' | 'compact' | 'percent';

export type DashboardDerivedKpiKey = 'activePlatformsCount' | 'avgViewsPerPost';

export type DashboardKpiKey = keyof IAnalytics | DashboardDerivedKpiKey;

export interface DashboardKpiDefinition {
  key: DashboardKpiKey;
  label: string;
  description: string;
  scopes: DashboardScopePreset[];
  trendKey?: keyof IAnalytics;
  fallbackKeys?: Array<keyof IAnalytics>;
  format?: DashboardKpiValueFormat;
}

export interface DashboardPresetData {
  analytics: Partial<IAnalytics> | null | undefined;
  timeSeriesData?: Array<Record<string, unknown>>;
  brandLeaderboard?: Array<Record<string, unknown>>;
  organizationLeaderboard?: Array<Record<string, unknown>>;
  topPosts?: Array<Record<string, unknown>>;
  platformComparisonData?: Array<Record<string, unknown>>;
}

export interface DashboardBlockPreset {
  scope: DashboardScopePreset;
  title: string;
  operation: AgentDashboardOperation;
  blocks: AgentUIBlock[];
}
