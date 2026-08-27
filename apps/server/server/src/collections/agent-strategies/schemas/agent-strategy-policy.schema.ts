export const AGENT_STRATEGY_GOAL_PROFILES = ['reach_traffic'] as const;
export type AgentStrategyGoalProfile =
  (typeof AGENT_STRATEGY_GOAL_PROFILES)[number];

export const AGENT_STRATEGY_BRAND_SAFETY_MODES = [
  'standard',
  'strict',
] as const;
export type AgentStrategyBrandSafetyMode =
  (typeof AGENT_STRATEGY_BRAND_SAFETY_MODES)[number];

export const AGENT_STRATEGY_OPPORTUNITY_SOURCE_TYPES = [
  'trend',
  'event',
  'evergreen',
] as const;
export type AgentStrategyOpportunitySourceType =
  (typeof AGENT_STRATEGY_OPPORTUNITY_SOURCE_TYPES)[number];

export const AGENT_STRATEGY_OPPORTUNITY_STATUSES = [
  'queued',
  'generating',
  'revising',
  'approved',
  'published',
  'held',
  'discarded',
  'expired',
] as const;
export type AgentStrategyOpportunityStatus =
  (typeof AGENT_STRATEGY_OPPORTUNITY_STATUSES)[number];

export const AGENT_STRATEGY_REPORT_TYPES = ['daily', 'weekly'] as const;
export type AgentStrategyReportType =
  (typeof AGENT_STRATEGY_REPORT_TYPES)[number];

export interface AgentStrategyOpportunitySources {
  trendWatchersEnabled: boolean;
  eventTriggersEnabled: boolean;
  evergreenCadenceEnabled: boolean;
}

export interface AgentStrategyBudgetCap {
  key: string;
  creditBudget: number;
}

export interface AgentStrategyBudgetPolicy {
  monthlyCreditBudget: number;
  reserveTrendBudget: number;
  perPlatformCaps: AgentStrategyBudgetCap[];
  perFormatCaps: AgentStrategyBudgetCap[];
  maxRetriesPerOpportunity: number;
}

export interface AgentStrategyPublishPolicy {
  autoPublishEnabled: boolean;
  minPostScore: number;
  minImageScore: number;
  videoAutopublishEnabled: boolean;
  brandSafetyMode: AgentStrategyBrandSafetyMode;
}

export interface AgentStrategyReportingPolicy {
  dailyDigestEnabled: boolean;
  weeklySummaryEnabled: boolean;
  reportRecipientUserIds: string[];
}

export interface AgentStrategyRankingPolicy {
  relevanceWeight: number;
  freshnessWeight: number;
  expectedTrafficWeight: number;
  historicalConfidenceWeight: number;
  costEfficiencyWeight: number;
}
