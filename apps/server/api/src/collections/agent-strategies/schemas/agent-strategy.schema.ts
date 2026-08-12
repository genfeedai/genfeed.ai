import type { AgentAutonomyMode } from '@genfeedai/enums';
import type { AgentStrategy as PrismaAgentStrategy } from '@genfeedai/prisma';

export type { AgentStrategy as PrismaAgentStrategy } from '@genfeedai/prisma';

export interface AgentStrategyBudgetPolicy {
  monthlyCreditBudget?: number;
  reserveTrendBudget?: number;
  [key: string]: unknown;
}

export interface AgentStrategyContentMix {
  carouselPercent?: number;
  imagePercent?: number;
  videoPercent?: number;
  [key: string]: unknown;
}

export interface AgentStrategyOpportunitySources {
  evergreenCadenceEnabled?: boolean;
  eventTriggersEnabled?: boolean;
  trendWatchersEnabled?: boolean;
  [key: string]: unknown;
}

export interface AgentStrategyPublishPolicy {
  autoPublishEnabled?: boolean;
  minImageScore?: number;
  minPostScore?: number;
  [key: string]: unknown;
}

export interface AgentStrategyRankingPolicy {
  costEfficiencyWeight?: number;
  expectedTrafficWeight?: number;
  freshnessWeight?: number;
  historicalConfidenceWeight?: number;
  relevanceWeight?: number;
  [key: string]: unknown;
}

export interface AgentStrategyReportingPolicy {
  dailyDigestEnabled?: boolean;
  [key: string]: unknown;
}

export interface AgentStrategyRunHistoryItem {
  completedAt?: Date | null;
  [key: string]: unknown;
}

export interface AgentStrategyDocument
  extends Omit<
    PrismaAgentStrategy,
    'config' | 'policies' | 'agentType' | 'platforms'
  > {
  agentType?: string;
  autonomyMode?: AgentAutonomyMode | string;
  budgetPolicy?: AgentStrategyBudgetPolicy;
  config?: Record<string, unknown>;
  contentMix?: AgentStrategyContentMix;
  creditsUsedThisWeek: number;
  dailyCreditBudget: number;
  dailyCreditResetAt?: Date | null;
  dailyCreditsUsed: number;
  dailyResetAt?: Date | null;
  goalProfile?: string;
  isEnabled?: boolean;
  model?: string | null;
  monthToDateCreditsUsed: number;
  monthlyResetAt?: Date | null;
  opportunitySources?: AgentStrategyOpportunitySources;
  platforms?: string[];
  policies?: Record<string, unknown>;
  postsPerWeek?: number;
  publishPolicy?: AgentStrategyPublishPolicy;
  qualityTier?: 'budget' | 'balanced' | 'high_quality';
  rankingPolicy?: AgentStrategyRankingPolicy;
  reportingPolicy?: AgentStrategyReportingPolicy;
  requiresManualReactivation?: boolean;
  reserveTrendBudgetRemaining: number;
  runHistory: AgentStrategyRunHistoryItem[];
  skillSlugs?: string[];
  preferredWorkflowId?: string;
  preferredWorkflowTemplateId?: string;
  topics?: string[];
  weeklyCreditBudget: number;
  workflowInputDefaults?: Record<string, unknown>;
  [key: string]: unknown;
}

export type AgentStrategy = AgentStrategyDocument;
