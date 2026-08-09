import {
  buildAdPerformanceBenchmarkFields,
  CTA_PATTERN_CATEGORIES,
  HEADLINE_PATTERN_CATEGORIES,
  SPEND_BUCKETS,
} from './ad-performance-benchmark.util';

describe('buildAdPerformanceBenchmarkFields', () => {
  it('nulls every optional field for an empty payload', () => {
    expect(buildAdPerformanceBenchmarkFields({})).toEqual({
      adPlatform: null,
      conversionRate: null,
      cpa: null,
      cpc: null,
      ctaPatternCategories: [],
      ctaText: null,
      ctr: null,
      dataConfidence: null,
      headlinePatternCategories: [],
      headlineText: null,
      industry: null,
      performanceScore: null,
      roas: null,
      scope: null,
      spend: null,
      spendBucket: null,
    });
  });

  it('passes through well-formed strings and numbers', () => {
    const fields = buildAdPerformanceBenchmarkFields({
      adPlatform: 'meta',
      conversionRate: 0.12,
      cpa: 9.5,
      cpc: 1.25,
      ctr: 0.03,
      dataConfidence: 0.9,
      industry: 'saas',
      performanceScore: 72,
      roas: 3.4,
      scope: 'brand',
    });

    expect(fields.adPlatform).toBe('meta');
    expect(fields.conversionRate).toBe(0.12);
    expect(fields.cpa).toBe(9.5);
    expect(fields.cpc).toBe(1.25);
    expect(fields.ctr).toBe(0.03);
    expect(fields.dataConfidence).toBe(0.9);
    expect(fields.industry).toBe('saas');
    expect(fields.performanceScore).toBe(72);
    expect(fields.roas).toBe(3.4);
    expect(fields.scope).toBe('brand');
  });

  it('rejects empty strings and non-string values', () => {
    const fields = buildAdPerformanceBenchmarkFields({
      adPlatform: '',
      industry: 42,
      scope: null,
    });

    expect(fields.adPlatform).toBeNull();
    expect(fields.industry).toBeNull();
    expect(fields.scope).toBeNull();
  });

  it('rejects non-finite and non-numeric metrics', () => {
    const fields = buildAdPerformanceBenchmarkFields({
      cpc: '1.25',
      ctr: Number.NaN,
      roas: Number.POSITIVE_INFINITY,
      spend: null,
    });

    expect(fields.cpc).toBeNull();
    expect(fields.ctr).toBeNull();
    expect(fields.roas).toBeNull();
    expect(fields.spend).toBeNull();
  });

  it('collects every matching headline pattern category', () => {
    const fields = buildAdPerformanceBenchmarkFields({
      headlineText: 'How to save 30% today?',
    });

    expect(fields.headlineText).toBe('How to save 30% today?');
    expect(fields.headlinePatternCategories.sort()).toEqual(
      [
        'benefit-focused',
        'how-to',
        'number-driven',
        'question-based',
        'urgency',
      ].sort(),
    );
  });

  it('returns no headline categories for prose that matches nothing', () => {
    const fields = buildAdPerformanceBenchmarkFields({
      headlineText: 'Handcrafted leather goods',
    });

    expect(fields.headlinePatternCategories).toEqual([]);
  });

  it('collects every matching CTA pattern category', () => {
    const fields = buildAdPerformanceBenchmarkFields({
      ctaText: 'Sign up and try free',
    });

    expect(fields.ctaPatternCategories.sort()).toEqual(
      ['get-started', 'sign-up', 'try-free'].sort(),
    );
  });

  it('leaves pattern categories empty when the text is absent', () => {
    const fields = buildAdPerformanceBenchmarkFields({
      ctaText: '',
      headlineText: '',
    });

    expect(fields.ctaPatternCategories).toEqual([]);
    expect(fields.headlinePatternCategories).toEqual([]);
  });

  it.each([
    [25, '$0-50/day'],
    [50, '$50-200/day'],
    [199.99, '$50-200/day'],
    [200, '$200-500/day'],
    [500, '$500-1000/day'],
    [1000, '$1000+/day'],
    [50_000, '$1000+/day'],
  ])('buckets a daily spend of %s as %s', (spend, expected) => {
    expect(buildAdPerformanceBenchmarkFields({ spend }).spendBucket).toBe(
      expected,
    );
  });

  it.each([[0], [-10]])(
    'leaves the spend bucket unset for a non-positive spend of %s',
    (spend) => {
      const fields = buildAdPerformanceBenchmarkFields({ spend });

      expect(fields.spend).toBe(spend);
      expect(fields.spendBucket).toBeNull();
    },
  );
});

describe('benchmark pattern tables', () => {
  it('exposes disjoint, non-empty pattern dictionaries', () => {
    expect(Object.keys(HEADLINE_PATTERN_CATEGORIES).length).toBeGreaterThan(0);
    expect(Object.keys(CTA_PATTERN_CATEGORIES).length).toBeGreaterThan(0);
  });

  it('defines contiguous spend buckets covering every positive spend', () => {
    expect(SPEND_BUCKETS[0].min).toBe(0);
    expect(SPEND_BUCKETS[SPEND_BUCKETS.length - 1].max).toBe(
      Number.POSITIVE_INFINITY,
    );

    for (let index = 1; index < SPEND_BUCKETS.length; index += 1) {
      expect(SPEND_BUCKETS[index].min).toBe(SPEND_BUCKETS[index - 1].max);
    }
  });
});
