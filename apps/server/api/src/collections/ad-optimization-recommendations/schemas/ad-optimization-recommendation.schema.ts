export type {
  AdOptimizationRecommendation,
  AdOptimizationRecommendation as AdOptimizationRecommendationDocument,
} from '@genfeedai/prisma';

export type RecommendationType =
  | 'pause'
  | 'promote'
  | 'budget_increase'
  | 'audience_expand';
