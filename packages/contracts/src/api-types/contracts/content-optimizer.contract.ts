/**
 * Schema-enforced shapes of the content optimizer's model answers (#4873).
 *
 * Every one of these used to go through `JsonParserUtil.parseAIResponse` with
 * `{}` as the fallback, so an unusable answer became an empty result the
 * caller reported as success — no hashtags, no variants, a score of 0.
 *
 * Score bands are the ones the endpoints already documented in their prompts:
 * 0-100 for analysis dimensions and hashtag fit, 0-100 confidence on a posting
 * slot.
 */

import { z } from 'zod';

export const optimizerSuggestionCategoryValues = [
  'readability',
  'engagement',
  'seo',
  'style',
  'tone',
  'hashtags',
] as const;

export const optimizerSuggestionTypeValues = [
  'improvement',
  'warning',
  'critical',
] as const;

export const optimizerPriorityValues = ['high', 'medium', 'low'] as const;

export const optimizerPromptFormatValues = [
  'portrait',
  'landscape',
  'square',
] as const;

export const hashtagSuggestionsSchema = z.object({
  optimal: z.array(z.string()),
  score: z.number().min(0).max(100),
  suggested: z.array(z.string()),
  trending: z.array(z.string()),
});

export const contentVariantsSchema = z.object({
  variants: z.array(
    z.object({
      content: z.string().min(1),
      description: z.string(),
      type: z.string().min(1),
    }),
  ),
});

export const generatedPromptsSchema = z.object({
  prompts: z.array(
    z.object({
      camera: z.string().min(1),
      cameraMovement: z.string().nullish(),
      format: z.enum(optimizerPromptFormatValues),
      lighting: z.string().min(1),
      mood: z.string().min(1),
      style: z.string().min(1),
      text: z.string().min(1),
    }),
  ),
});

export const postingTimeRecommendationsSchema = z.object({
  recommendedTimes: z.array(
    z.object({
      confidence: z.number().min(0).max(100),
      day: z.string().min(1),
      reason: z.string(),
      time: z.string().min(1),
    }),
  ),
});

export const contentAnalysisSchema = z.object({
  breakdown: z.object({
    clarity: z.number().min(0).max(100),
    engagement: z.number().min(0).max(100),
    platformOptimization: z.number().min(0).max(100),
    readability: z.number().min(0).max(100),
    viralPotential: z.number().min(0).max(100),
  }),
  overallScore: z.number().min(0).max(100),
  suggestions: z.array(
    z.object({
      category: z.enum(optimizerSuggestionCategoryValues),
      impact: z.enum(optimizerPriorityValues).nullish(),
      message: z.string().min(1),
      originalText: z.string().nullish(),
      priority: z.enum(optimizerPriorityValues).nullish(),
      suggestedText: z.string().nullish(),
      type: z.enum(optimizerSuggestionTypeValues),
    }),
  ),
});

export const contentOptimizationSchema = z.object({
  changes: z.array(
    z.object({
      field: z.string().min(1),
      optimized: z.string(),
      original: z.string(),
      reason: z.string(),
    }),
  ),
  improvementScore: z.number(),
  optimized: z.string().min(1),
});

export type HashtagSuggestions = z.infer<typeof hashtagSuggestionsSchema>;
export type ContentVariants = z.infer<typeof contentVariantsSchema>;
export type GeneratedPrompts = z.infer<typeof generatedPromptsSchema>;
export type PostingTimeRecommendations = z.infer<
  typeof postingTimeRecommendationsSchema
>;
export type ContentAnalysis = z.infer<typeof contentAnalysisSchema>;
export type ContentOptimization = z.infer<typeof contentOptimizationSchema>;

export const HASHTAG_SUGGESTIONS_SCHEMA_NAME = 'hashtag_suggestions';
export const CONTENT_VARIANTS_SCHEMA_NAME = 'content_variants';
export const GENERATED_PROMPTS_SCHEMA_NAME = 'generated_prompts';
export const POSTING_TIME_RECOMMENDATIONS_SCHEMA_NAME =
  'posting_time_recommendations';
export const CONTENT_ANALYSIS_SCHEMA_NAME = 'content_analysis';
export const CONTENT_OPTIMIZATION_SCHEMA_NAME = 'content_optimization';
