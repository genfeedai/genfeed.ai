import type { AdOptimizationRecommendation as PrismaAdOptimizationRecommendation } from '@genfeedai/prisma';

export type { AdOptimizationRecommendation as PrismaAdOptimizationRecommendation } from '@genfeedai/prisma';

export type RecommendationType =
  | 'pause'
  | 'promote'
  | 'budget_increase'
  | 'audience_expand';

export type RecommendationStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'executed'
  | 'expired';

export interface RecommendationMetrics {
  clicks?: number;
  cpm?: number;
  ctr?: number;
  impressions?: number;
  roas?: number;
  spend?: number;
  [key: string]: unknown;
}

export interface RecommendationSuggestedAction {
  budgetIncreasePct?: number;
  maxDailyBudget?: number;
  [key: string]: unknown;
}

export interface AdOptimizationRecommendationDocument
  extends Omit<PrismaAdOptimizationRecommendation, 'data'> {
  _id: string;
  data?: Record<string, unknown>;
  entityId?: string;
  entityName?: string;
  entityType?: string;
  expiresAt?: Date | string;
  metrics?: RecommendationMetrics;
  organization: string;
  reason?: string;
  recommendationType?: RecommendationType | string;
  runDate?: Date | string;
  runId?: string;
  status?: RecommendationStatus | string;
  suggestedAction?: RecommendationSuggestedAction;
  [key: string]: unknown;
}

export type AdOptimizationRecommendation = AdOptimizationRecommendationDocument;
