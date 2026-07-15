import type { AgentStrategyDocument } from '@api/collections/agent-strategies/schemas/agent-strategy.schema';
import type { AgentStrategyOpportunityDocument } from '@api/collections/agent-strategies/schemas/agent-strategy-opportunity.schema';
import type { ContentDraftDocument } from '@api/collections/content-drafts/schemas/content-draft.schema';

export interface BudgetPacingState {
  expectedSpendToDate: number;
  monthBudget: number;
  monthToDateCreditsUsed: number;
  remainingDailyBudget: number;
  remainingMonthlyBudget: number;
  remainingWeeklyBudget: number;
  reserveTrendBudgetRemaining: number;
}

export interface PublishGateResult {
  decision: 'approved' | 'discard' | 'hold' | 'revise';
  overallScore: number;
  reasons: string[];
  revisionInstructions: string[];
  scoreBreakdown: Record<string, number>;
}

export interface AgentStrategyPerformanceSnapshot {
  bestPlatformFormatPairs: Array<{
    format: string;
    platform: string;
    score: number;
  }>;
  bestPostingWindows: string[];
  clicks: number;
  costPerVisit: number;
  creditsSpent: number;
  ctr: number;
  generatedCount: number;
  impressions: number;
  publishedCount: number;
  topHooks: string[];
  topTopics: string[];
  visits: number;
}

export interface ExecuteRunResult {
  contentGenerated: number;
  creditsUsed: number;
  summary: string;
}

export interface OptimizerAnalysisResult {
  breakdown?: {
    clarity?: number;
    engagement?: number;
    platformOptimization?: number;
    readability?: number;
  };
  metadata?: {
    hasCallToAction?: boolean;
  };
  overallScore?: number;
}

export interface ImageEvaluationResult {
  overallScore?: number;
  scores?: {
    brand?: { overall?: number };
    engagement?: { overall?: number };
    technical?: { overall?: number };
  };
}

export interface FinalizeOpportunityInput {
  draft: ContentDraftDocument;
  draftContent: string;
  format: string;
  gate: PublishGateResult;
  opportunity: AgentStrategyOpportunityDocument;
  organizationId: string;
  platform: string;
  strategy: AgentStrategyDocument;
  userId: string;
}
