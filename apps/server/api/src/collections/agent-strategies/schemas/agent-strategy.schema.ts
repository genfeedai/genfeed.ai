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

/**
 * Document shape for agent strategies.
 *
 * Prisma stores most autopilot fields in `config` / `policies` JSON. The service
 * flattens those onto the row for callers, so this type is Prisma scalars plus
 * the decoded document fields (not a pure Prisma row).
 */
export type AgentStrategyDocument = Omit<
  PrismaAgentStrategy,
  'agentType' | 'config' | 'platforms' | 'policies' | 'workflowInputOverrides'
> & {
  agentType?: string;
  autonomyMode?: AgentAutonomyMode | string;
  /** Optional populated brand relation (label only used by workflow prompt builder). */
  brand?: { label?: string | null } | null;
  budgetPolicy?: AgentStrategyBudgetPolicy;
  config?: Record<string, unknown>;
  consecutiveFailures?: number;
  contentMix?: AgentStrategyContentMix;
  creditsUsedThisWeek: number;
  dailyCreditBudget: number;
  dailyCreditResetAt?: Date | null;
  dailyCreditsUsed: number;
  dailyResetAt?: Date | null;
  displayRole?: string;
  engagementEnabled?: boolean;
  goalProfile?: string;
  isEnabled?: boolean;
  model?: string | null;
  monthToDateCreditsUsed: number;
  monthlyResetAt?: Date | null;
  opportunitySources?: AgentStrategyOpportunitySources;
  platforms?: string[];
  policies?: Record<string, unknown>;
  postsPerWeek?: number;
  preferredPostingTimes?: string[];
  preferredWorkflowId?: string | null;
  preferredWorkflowTemplateId?: string | null;
  publishPolicy?: AgentStrategyPublishPolicy;
  qualityTier?: 'budget' | 'balanced' | 'high_quality';
  rankingPolicy?: AgentStrategyRankingPolicy;
  reportingPolicy?: AgentStrategyReportingPolicy;
  reportsToLabel?: string;
  requiresManualReactivation?: boolean;
  reserveTrendBudgetRemaining: number;
  runFrequency?: string;
  runHistory: AgentStrategyRunHistoryItem[];
  skillSlugs?: string[];
  teamGroup?: string;
  timezone?: string;
  topics?: string[];
  /** Brand voice string stored in config JSON. */
  voice?: string | null;
  weeklyCreditBudget: number;
  workflowInputOverrides?: Array<{
    key: string;
    value: string | number | boolean;
  }>;
};

export type AgentStrategy = AgentStrategyDocument;
