import {
  buildAdPerformanceBenchmarkFields,
  CTA_PATTERN_CATEGORIES,
  HEADLINE_PATTERN_CATEGORIES,
  SPEND_BUCKETS,
} from '@server/collections/ad-performance/utils/ad-performance-benchmark.util';
import { describe, expect, it } from 'vitest';

describe('buildAdPerformanceBenchmarkFields', () => {
  it('extracts scalar benchmark dimensions and metrics', () => {
    const result = buildAdPerformanceBenchmarkFields({
      adPlatform: 'meta',
      conversionRate: 0.12,
      cpa: 14,
      cpc: 1.2,
      ctr: 0.05,
      dataConfidence: 0.9,
      industry: 'fitness',
      performanceScore: 88,
      roas: 3.2,
      scope: 'public',
      spend: 120,
    });

    expect(result).toMatchObject({
      adPlatform: 'meta',
      conversionRate: 0.12,
      cpa: 14,
      cpc: 1.2,
      ctr: 0.05,
      dataConfidence: 0.9,
      industry: 'fitness',
      performanceScore: 88,
      roas: 3.2,
      scope: 'public',
      spend: 120,
      spendBucket: '$50-200/day',
    });
  });

  it('maps spend values onto the configured spend buckets', () => {
    expect(SPEND_BUCKETS.map((bucket) => bucket.label)).toEqual([
      '$0-50/day',
      '$50-200/day',
      '$200-500/day',
      '$500-1000/day',
      '$1000+/day',
    ]);

    expect(buildAdPerformanceBenchmarkFields({ spend: 49 }).spendBucket).toBe(
      '$0-50/day',
    );
    expect(buildAdPerformanceBenchmarkFields({ spend: 50 }).spendBucket).toBe(
      '$50-200/day',
    );
    expect(buildAdPerformanceBenchmarkFields({ spend: 1000 }).spendBucket).toBe(
      '$1000+/day',
    );
    expect(
      buildAdPerformanceBenchmarkFields({ spend: 0 }).spendBucket,
    ).toBeNull();
  });

  it('extracts headline and CTA pattern categories', () => {
    expect(Object.keys(HEADLINE_PATTERN_CATEGORIES)).toContain('urgency');
    expect(Object.keys(CTA_PATTERN_CATEGORIES)).toContain('shop-now');

    const result = buildAdPerformanceBenchmarkFields({
      ctaText: 'Shop now',
      headlineText: 'Save 20 today',
    });

    expect(result.headlinePatternCategories).toEqual(
      expect.arrayContaining(['benefit-focused', 'number-driven', 'urgency']),
    );
    expect(result.ctaPatternCategories).toEqual(['shop-now']);
  });

  it('normalizes invalid values to null benchmark fields', () => {
    const result = buildAdPerformanceBenchmarkFields({
      adPlatform: '',
      ctr: Number.NaN,
      industry: 42,
      roas: Number.POSITIVE_INFINITY,
    });

    expect(result.adPlatform).toBeNull();
    expect(result.ctr).toBeNull();
    expect(result.industry).toBeNull();
    expect(result.roas).toBeNull();
  });
});
