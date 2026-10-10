import type { AgentStrategyDocument } from '@api/collections/agent-strategies/schemas/agent-strategy.schema';
import type { AgentStrategyOpportunityDocument } from '@api/collections/agent-strategies/schemas/agent-strategy-opportunity.schema';
import type { PostDocument } from '@api/collections/posts/post.schema';
import type { AgentStrategyCadenceStatus } from '@genfeedai/contracts/interfaces';

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
  cadence?: AgentStrategyCadenceStatus;
  bestPlatformFormatPairs: Array<{
    format: string;
    platform: string;
    score: number;
  }>;
  bestPostingWindows: string[];
  clicks: number;
  costPerVisit: number | null;
  creditsSpent: number;
  ctr: number;
  generatedCount: number;
  impressions: number;
  publishedCount: number;
  sampling?: {
    limit: number;
    matchedPosts: number;
    matchedMeasurements: number;
    postsSampled: number;
    measurementsSampled: number;
    truncated: boolean;
  };
  topHooks: string[];
  topTopics: string[];
  visits: number | null;
}

export interface ExecuteRunResult {
  contentGenerated: number;
  creditsUsed: number;
  summary: string;
}

export type CadenceDraftGenerator = (input: {
  creditBudget: number;
  format: string;
  opportunity: AgentStrategyOpportunityDocument;
  platform: string;
  strategy: AgentStrategyDocument;
  userId: string;
}) => Promise<{
  draft?: PostDocument;
  creditsUsed: number;
  evaluateQuality?: (
    content?: string,
    platform?: string,
  ) => Promise<{
    analysis: OptimizerAnalysisResult;
    creditsUsed: number;
  }>;
}>;

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
  evaluateQuality?: Awaited<
    ReturnType<CadenceDraftGenerator>
  >['evaluateQuality'];
  evaluatedReceipt?: string;
  draft: PostDocument;
  draftContent: string;
  format: string;
  gate: PublishGateResult;
  opportunity: AgentStrategyOpportunityDocument;
  organizationId: string;
  platform: string;
  strategy: AgentStrategyDocument;
  userId: string;
}
