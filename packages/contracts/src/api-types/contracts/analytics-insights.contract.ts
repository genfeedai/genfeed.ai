/**
 * Schema-enforced shapes of the analytics insight paths (#4873).
 *
 * Four separate prompts fed one `Record<string, unknown>` reader apiece, so
 * every missing field became a zero and an unusable answer became a
 * confident-looking report of nothing. Bands here are the ones the prompts
 * already stated: 0-100 scores, percentages and confidences.
 */

import { z } from 'zod';

export const insightCategoryValues = [
  'trend',
  'opportunity',
  'warning',
  'tip',
] as const;

export const insightImpactValues = ['high', 'medium', 'low'] as const;

export const viralPredictionSchema = z.object({
  estimatedReach: z.object({
    max: z.number().min(0),
    min: z.number().min(0),
  }),
  factors: z.array(
    z.object({
      description: z.string().min(1),
      factor: z.string().min(1),
      impact: z.number(),
    }),
  ),
  probability: z.number().min(0).max(100),
  recommendations: z.array(z.string()),
  score: z.number().min(0).max(100),
});

export const contentGapAnalysisSchema = z.object({
  missingTopics: z.array(z.string()),
  opportunityAreas: z.array(
    z.object({
      area: z.string().min(1),
      competition: z.string().min(1),
      potential: z.number().min(0).max(100),
      recommendations: z.array(z.string()),
    }),
  ),
  underservedAudiences: z.array(z.string()),
});

export const insightPostingTimesSchema = z.object({
  recommendedTimes: z.array(
    z.object({
      confidence: z.number().min(0).max(100),
      day: z.string().min(1),
      reason: z.string().min(1),
      time: z.string().min(1),
    }),
  ),
});

export const generatedInsightsSchema = z.object({
  insights: z.array(
    z.object({
      actionableSteps: z.array(z.string()),
      confidence: z.number().min(0).max(100),
      description: z.string().min(1),
      impact: z.enum(insightImpactValues),
      relatedMetrics: z.array(z.string()),
      title: z.string().min(1),
      type: z.enum(insightCategoryValues),
    }),
  ),
});

export type ViralPrediction = z.infer<typeof viralPredictionSchema>;
export type ContentGapAnalysis = z.infer<typeof contentGapAnalysisSchema>;
export type InsightPostingTimes = z.infer<typeof insightPostingTimesSchema>;
export type GeneratedInsights = z.infer<typeof generatedInsightsSchema>;

export const VIRAL_PREDICTION_SCHEMA_NAME = 'viral_prediction';
export const CONTENT_GAP_ANALYSIS_SCHEMA_NAME = 'content_gap_analysis';
export const INSIGHT_POSTING_TIMES_SCHEMA_NAME = 'insight_posting_times';
export const GENERATED_INSIGHTS_SCHEMA_NAME = 'generated_insights';
