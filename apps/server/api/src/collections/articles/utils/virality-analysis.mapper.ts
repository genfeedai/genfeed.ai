/**
 * Shared virality analysis mapper.
 * Single source of truth for building ViralityAnalysis objects from AI responses
 * and extracting performance metrics updates.
 *
 * Replaces duplicate logic previously in:
 * - articles.service.ts (analyzeVirality)
 * - articles-analytics.service.ts (analyzeVirality)
 */
import type {
  ViralityAnalysis,
  ViralityAnalysisResponse,
} from '@api/collections/articles/dto/analyze-virality.dto';

/**
 * Shape of the raw AI response before mapping to ViralityAnalysis.
 */
export interface ParsedViralityResponse {
  factors: {
    emotionalAppeal?: number;
    readability?: number;
    seoScore?: number;
    shareability?: number;
    trendAlignment?: number;
  };
  predictions: {
    estimatedEngagement?: number;
    estimatedReach?: number;
    estimatedShares?: number;
  };
  suggestions: string[];
  viralityScore: number;
}

/**
 * Validates that the parsed AI response has the required shape.
 * Throws if critical fields are missing.
 */
export function validateViralityResponse(
  response: unknown,
): asserts response is ParsedViralityResponse {
  if (
    !response ||
    typeof response !== 'object' ||
    typeof (response as Record<string, unknown>).viralityScore !== 'number' ||
    !(response as Record<string, unknown>).factors ||
    !(response as Record<string, unknown>).predictions ||
    !(response as Record<string, unknown>).suggestions
  ) {
    throw new Error('Invalid response format from AI service');
  }
}

/**
 * Maps a validated AI response to a canonical ViralityAnalysis object.
 * Applies safe defaults (0) for any missing numeric fields.
 */
export function mapToViralityAnalysis(
  response: ParsedViralityResponse,
): ViralityAnalysis {
  return {
    analyzedAt: new Date(),
    factors: {
      emotionalAppeal: response.factors.emotionalAppeal || 0,
      readability: response.factors.readability || 0,
      seoScore: response.factors.seoScore || 0,
      shareability: response.factors.shareability || 0,
      trendAlignment: response.factors.trendAlignment || 0,
    },
    predictions: {
      estimatedEngagement: response.predictions.estimatedEngagement || 0,
      estimatedReach: response.predictions.estimatedReach || 0,
      estimatedShares: response.predictions.estimatedShares || 0,
    },
    score: response.viralityScore,
    suggestions: response.suggestions || [],
  };
}

/**
 * Builds a ViralityAnalysisResponse from an article ID and AI response.
 * Convenience wrapper that validates, maps, and packages the result.
 */
export function buildViralityAnalysisResponse(
  articleId: string,
  rawResponse: unknown,
): ViralityAnalysisResponse {
  validateViralityResponse(rawResponse);
  const analysis = mapToViralityAnalysis(rawResponse);
  return { analysis, articleId };
}

/**
 * Performance metrics shape forwarded to the article-analytics collection.
 */
export interface PerformanceMetricsInput {
  views?: number;
  shares?: number;
  likes?: number;
  comments?: number;
  clickThroughRate?: number;
}

/**
 * Normalises raw metrics input into the shape expected by ArticleAnalyticsService.
 * Ensures only defined keys are forwarded.
 */
export function normalizePerformanceMetrics(
  metrics: PerformanceMetricsInput,
): PerformanceMetricsInput {
  return {
    clickThroughRate: metrics.clickThroughRate,
    comments: metrics.comments,
    likes: metrics.likes,
    shares: metrics.shares,
    views: metrics.views,
  };
}
