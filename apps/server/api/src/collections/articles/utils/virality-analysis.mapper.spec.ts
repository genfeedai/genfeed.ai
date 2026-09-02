import { describe, expect, it } from 'vitest';
import {
  buildViralityAnalysisResponse,
  mapToViralityAnalysis,
  normalizePerformanceMetrics,
  type ParsedViralityResponse,
  validateViralityResponse,
} from './virality-analysis.mapper';

describe('virality-analysis.mapper', () => {
  const validAiResponse: ParsedViralityResponse = {
    factors: {
      emotionalAppeal: 90,
      readability: 80,
      seoScore: 75,
      shareability: 88,
      trendAlignment: 70,
    },
    predictions: {
      estimatedEngagement: 1200,
      estimatedReach: 50000,
      estimatedShares: 300,
    },
    suggestions: ['Add more emotional hooks', 'Improve headline clarity'],
    viralityScore: 85,
  };

  describe('mapToViralityAnalysis', () => {
    it('should map all fields correctly from a valid AI response', () => {
      const result = mapToViralityAnalysis(validAiResponse);

      expect(result.score).toBe(85);
      expect(result.factors.emotionalAppeal).toBe(90);
      expect(result.factors.readability).toBe(80);
      expect(result.factors.seoScore).toBe(75);
      expect(result.factors.shareability).toBe(88);
      expect(result.factors.trendAlignment).toBe(70);
      expect(result.predictions.estimatedEngagement).toBe(1200);
      expect(result.predictions.estimatedReach).toBe(50000);
      expect(result.predictions.estimatedShares).toBe(300);
      expect(result.suggestions).toEqual([
        'Add more emotional hooks',
        'Improve headline clarity',
      ]);
      expect(result.analyzedAt).toBeInstanceOf(Date);
    });

    it('should return default values (0) for missing numeric fields', () => {
      const sparse: ParsedViralityResponse = {
        factors: {} as ParsedViralityResponse['factors'],
        predictions: {} as ParsedViralityResponse['predictions'],
        suggestions: [],
        viralityScore: 50,
      };

      const result = mapToViralityAnalysis(sparse);

      expect(result.score).toBe(50);
      expect(result.factors.emotionalAppeal).toBe(0);
      expect(result.factors.readability).toBe(0);
      expect(result.factors.seoScore).toBe(0);
      expect(result.factors.shareability).toBe(0);
      expect(result.factors.trendAlignment).toBe(0);
      expect(result.predictions.estimatedEngagement).toBe(0);
      expect(result.predictions.estimatedReach).toBe(0);
      expect(result.predictions.estimatedShares).toBe(0);
      expect(result.suggestions).toEqual([]);
    });
  });

  describe('validateViralityResponse', () => {
    it('should pass validation for a valid response', () => {
      expect(() => validateViralityResponse(validAiResponse)).not.toThrow();
    });

    it('should throw for null/undefined input', () => {
      expect(() => validateViralityResponse(null)).toThrow(
        'Invalid response format from AI service',
      );
      expect(() => validateViralityResponse(undefined)).toThrow(
        'Invalid response format from AI service',
      );
    });

    it('should throw when viralityScore is not a number', () => {
      expect(() =>
        validateViralityResponse({
          ...validAiResponse,
          viralityScore: 'high',
        }),
      ).toThrow('Invalid response format from AI service');
    });

    it('should throw when required fields are missing', () => {
      expect(() => validateViralityResponse({ viralityScore: 50 })).toThrow(
        'Invalid response format from AI service',
      );
    });
  });

  describe('buildViralityAnalysisResponse', () => {
    it('should return a complete ViralityAnalysisResponse', () => {
      const result = buildViralityAnalysisResponse(
        'article-123',
        validAiResponse,
      );

      expect(result.articleId).toBe('article-123');
      expect(result.analysis.score).toBe(85);
      expect(result.analysis.factors.emotionalAppeal).toBe(90);
      expect(result.analysis.analyzedAt).toBeInstanceOf(Date);
    });

    it('should throw for invalid raw response', () => {
      expect(() => buildViralityAnalysisResponse('article-123', null)).toThrow(
        'Invalid response format from AI service',
      );
    });
  });

  describe('normalizePerformanceMetrics', () => {
    it('should return correct shape with all fields', () => {
      const metrics = {
        clickThroughRate: 0.05,
        comments: 10,
        likes: 50,
        shares: 25,
        views: 100,
      };

      const result = normalizePerformanceMetrics(metrics);

      expect(result).toEqual({
        clickThroughRate: 0.05,
        comments: 10,
        likes: 50,
        shares: 25,
        views: 100,
      });
    });

    it('should handle partial metrics (undefined fields)', () => {
      const result = normalizePerformanceMetrics({ views: 42 });

      expect(result.views).toBe(42);
      expect(result.shares).toBeUndefined();
      expect(result.likes).toBeUndefined();
      expect(result.comments).toBeUndefined();
      expect(result.clickThroughRate).toBeUndefined();
    });
  });

  describe('consistency between services', () => {
    it('should produce identical output regardless of which service calls the mapper', () => {
      // Simulates both services calling the same mapper with the same input
      const result1 = buildViralityAnalysisResponse('art-1', validAiResponse);
      const result2 = buildViralityAnalysisResponse('art-1', validAiResponse);

      // Same structure, same values (analyzedAt will differ by ms, compare structure)
      expect(result1.analysis.score).toBe(result2.analysis.score);
      expect(result1.analysis.factors).toEqual(result2.analysis.factors);
      expect(result1.analysis.predictions).toEqual(
        result2.analysis.predictions,
      );
      expect(result1.analysis.suggestions).toEqual(
        result2.analysis.suggestions,
      );
      expect(result1.articleId).toBe(result2.articleId);
    });
  });
});
