export interface ContentMixConfig {
  imagePercent: number;
  videoPercent: number;
  carouselPercent: number;
  reelPercent: number;
  storyPercent: number;
}

export interface OpportunitySourcesConfig {
  evergreenCadenceEnabled: boolean;
  eventTriggersEnabled: boolean;
  trendWatchersEnabled: boolean;
}

export interface BudgetPolicyCap {
  creditBudget: number;
  key: string;
}

export interface BudgetPolicyConfig {
  maxRetriesPerOpportunity: number;
  monthlyCreditBudget: number;
  perFormatCaps: BudgetPolicyCap[];
  perPlatformCaps: BudgetPolicyCap[];
  reserveTrendBudget: number;
}

export interface PublishPolicyConfig {
  autoPublishEnabled: boolean;
  brandSafetyMode: 'standard' | 'strict';
  minImageScore: number;
  minPostScore: number;
  videoAutopublishEnabled: boolean;
}

export interface ReportingPolicyConfig {
  dailyDigestEnabled: boolean;
  reportRecipientUserIds: string[];
  weeklySummaryEnabled: boolean;
}

export interface RankingPolicyConfig {
  costEfficiencyWeight: number;
  expectedTrafficWeight: number;
  freshnessWeight: number;
  historicalConfidenceWeight: number;
  relevanceWeight: number;
}

export interface AgentStrategyRun {
  startedAt: string;
  completedAt?: string;
  status: 'completed' | 'failed' | 'budget_exhausted';
  creditsUsed: number;
  contentGenerated: number;
  threadId?: string;
}

export interface AgentStrategy {
  id: string;
  agentType?: string;
  autonomyMode?: string;
  autoPublishConfidenceThreshold?: number;
  budgetPolicy?: BudgetPolicyConfig;
  label: string;
  goalProfile?: 'reach_traffic';
  isActive: boolean;
  isEnabled: boolean;
  topics: string[];
  voice?: string;
  platforms: string[];
  contentMix?: ContentMixConfig;
  postsPerWeek: number;
  isEngagementEnabled: boolean;
  engagementKeywords: string[];
  engagementTone?: string;
  maxEngagementsPerDay: number;
  runFrequency: 'every_6_hours' | 'twice_daily' | 'daily';
  timezone: string;
  preferredPostingTimes: string[];
  dailyCreditBudget: number;
  weeklyCreditBudget: number;
  monthToDateCreditsUsed?: number;
  expectedSpendToDate?: number;
  reserveTrendBudgetRemaining?: number;
  opportunitySources?: OpportunitySourcesConfig;
  publishPolicy?: PublishPolicyConfig;
  reportingPolicy?: ReportingPolicyConfig;
  rankingPolicy?: RankingPolicyConfig;
  creditsUsedToday: number;
  creditsUsedThisWeek: number;
  lastRunAt?: string;
  nextRunAt?: string;
  consecutiveFailures: number;
  runHistory: AgentStrategyRun[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateAgentStrategyPayload {
  agentType?: string;
  autonomyMode?: string;
  autoPublishConfidenceThreshold?: number;
  budgetPolicy?: Partial<BudgetPolicyConfig>;
  goalProfile?: 'reach_traffic';
  label: string;
  opportunitySources?: Partial<OpportunitySourcesConfig>;
  topics?: string[];
  voice?: string;
  platforms?: string[];
  postsPerWeek?: number;
  publishPolicy?: Partial<PublishPolicyConfig>;
  reportingPolicy?: Partial<ReportingPolicyConfig>;
  rankingPolicy?: Partial<RankingPolicyConfig>;
  runFrequency?: string;
  timezone?: string;
  dailyCreditBudget?: number;
  weeklyCreditBudget?: number;
}

export interface UpdateAgentStrategyPayload
  extends Partial<CreateAgentStrategyPayload> {
  isEnabled?: boolean;
  isEngagementEnabled?: boolean;
  engagementKeywords?: string[];
  engagementTone?: string;
  maxEngagementsPerDay?: number;
  preferredPostingTimes?: string[];
  contentMix?: Partial<ContentMixConfig>;
}
