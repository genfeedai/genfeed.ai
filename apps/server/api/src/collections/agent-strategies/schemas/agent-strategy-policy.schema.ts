export const AGENT_STRATEGY_GOAL_PROFILES = ['reach_traffic'] as const;
export type AgentStrategyGoalProfile =
  (typeof AGENT_STRATEGY_GOAL_PROFILES)[number];

export const AGENT_STRATEGY_OPPORTUNITY_SOURCE_TYPES = [
  'trend',
  'event',
  'evergreen',
  'conversation',
] as const;
export type AgentStrategyOpportunitySourceType =
  (typeof AGENT_STRATEGY_OPPORTUNITY_SOURCE_TYPES)[number];

/**
 * Conversation opportunities are human-reviewed X posts to reply to. The
 * autopilot never plans, budgets or publishes from them: the opportunity reads
 * it uses leave this source type out.
 */
export const CONVERSATION_OPPORTUNITY_SOURCE_TYPE = 'conversation' as const;

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
  autoPublishAfterApprovals?: number;
  reviewTimeoutHours?: number;
  platformStates?: Record<
    string,
    {
      approvalStreak: number;
      autoPublishEnabled: boolean;
      lastDecisionKey?: string;
    }
  >;
  autoPublishEnabled: boolean;
  minPostScore: number;
  minImageScore: number;
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
