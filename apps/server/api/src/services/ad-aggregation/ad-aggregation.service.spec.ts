import { AdAggregationService } from '@api/services/ad-aggregation/ad-aggregation.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { type AdPerformance } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';

const mockAggregate = vi.fn();

const mockAdPerformanceModel = {
  aggregate: mockAggregate,
};

const mockLoggerService = {
  debug: vi.fn(),
  error: vi.fn(),
  log: vi.fn(),
  warn: vi.fn(),
};

describe('AdAggregationService', () => {
  let service: AdAggregationService;

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdAggregationService,
        { provide: PrismaService, useValue: mockAdPerformanceModel },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
      ],
    }).compile();

    service = module.get<AdAggregationService>(AdAggregationService);
  });

  // ─── computeTopHeadlines ────────────────────────────────────────────────────

  describe('computeTopHeadlines', () => {
    it('should return patterns for all 8 categories with empty DB results', async () => {
      mockAggregate.mockResolvedValue([]);

      const result = await service.computeTopHeadlines();

      expect(result.patterns).toHaveLength(8);
      expect(result.sampleSize).toBe(0);
      expect(result.patterns.every((p) => p.avgCtr === 0)).toBe(true);
      expect(result.patterns.every((p) => p.avgRoas === 0)).toBe(true);
      expect(result.patterns.every((p) => p.sampleSize === 0)).toBe(true);
    });

    it('should include all expected category names', async () => {
      mockAggregate.mockResolvedValue([]);

      const result = await service.computeTopHeadlines();
      const categories = result.patterns.map((p) => p.category);

      expect(categories).toContain('benefit-focused');
      expect(categories).toContain('comparison');
      expect(categories).toContain('curiosity-gap');
      expect(categories).toContain('how-to');
      expect(categories).toContain('number-driven');
      expect(categories).toContain('question-based');
      expect(categories).toContain('testimonial');
      expect(categories).toContain('urgency');
    });

    it('should aggregate data from DB results correctly', async () => {
      // First category returns data, rest return empty
      mockAggregate
        .mockResolvedValueOnce([
          { avgCtr: 0.05, avgRoas: 3.2, sampleSize: 100 },
        ])
        .mockResolvedValue([]);

      const result = await service.computeTopHeadlines();

      const benefitFocused = result.patterns.find(
        (p) => p.category === 'benefit-focused',
      );
      expect(benefitFocused?.avgCtr).toBe(0.05);
      expect(benefitFocused?.avgRoas).toBe(3.2);
      expect(benefitFocused?.sampleSize).toBe(100);
      expect(result.sampleSize).toBe(100);
    });

    it('should sum sampleSizes across all categories', async () => {
      mockAggregate
        .mockResolvedValueOnce([{ avgCtr: 0.05, avgRoas: 2.0, sampleSize: 50 }])
        .mockResolvedValueOnce([{ avgCtr: 0.03, avgRoas: 1.5, sampleSize: 30 }])
        .mockResolvedValue([]);

      const result = await service.computeTopHeadlines();
      expect(result.sampleSize).toBe(80);
    });

    it('should filter by industry when provided', async () => {
      mockAggregate.mockResolvedValue([]);

      await service.computeTopHeadlines('ecommerce');

      // Should have called aggregate 8 times (one per category)
      expect(mockAggregate).toHaveBeenCalledTimes(8);
      // Check that the first call's pipeline includes industry filter
      const firstCallPipeline = mockAggregate.mock.calls[0][0];
      expect(firstCallPipeline[0].$match.industry).toBe('ecommerce');
    });

    it('should not include industry filter when not provided', async () => {
      mockAggregate.mockResolvedValue([]);

      await service.computeTopHeadlines();

      const firstCallPipeline = mockAggregate.mock.calls[0][0];
      expect(firstCallPipeline[0].$match.industry).toBeUndefined();
    });

    it('should handle aggregate errors gracefully per category', async () => {
      mockAggregate
        .mockRejectedValueOnce(new Error('DB error'))
        .mockResolvedValue([]);

      const result = await service.computeTopHeadlines();

      // Should still return 8 patterns
      expect(result.patterns).toHaveLength(8);
      // Failed category gets zeros
      const firstCategory = result.patterns[0];
      expect(firstCategory.avgCtr).toBe(0);
      expect(firstCategory.avgRoas).toBe(0);
      expect(firstCategory.sampleSize).toBe(0);
      expect(mockLoggerService.error).toHaveBeenCalledOnce();
    });

    it('should continue processing remaining categories after one fails', async () => {
      mockAggregate
        .mockRejectedValueOnce(new Error('DB error'))
        .mockResolvedValueOnce([{ avgCtr: 0.04, avgRoas: 2.5, sampleSize: 75 }])
        .mockResolvedValue([]);

      const result = await service.computeTopHeadlines();

      expect(result.patterns).toHaveLength(8);
      expect(result.sampleSize).toBe(75);
    });

    it('should default missing row fields to 0', async () => {
      mockAggregate
        .mockResolvedValueOnce([{ sampleSize: 10 }])
        .mockResolvedValue([]);

      const result = await service.computeTopHeadlines();
      const first = result.patterns[0];
      expect(first.avgCtr).toBe(0);
      expect(first.avgRoas).toBe(0);
      expect(first.sampleSize).toBe(10);
    });
  });

  // ─── computeBestCtas ────────────────────────────────────────────────────────

  describe('computeBestCtas', () => {
    it('should return patterns for all 8 CTA categories', async () => {
      mockAggregate.mockResolvedValue([]);

      const result = await service.computeBestCtas();

      expect(result.patterns).toHaveLength(8);
      expect(result.sampleSize).toBe(0);
    });

    it('should include all expected CTA category names', async () => {
      mockAggregate.mockResolvedValue([]);

      const result = await service.computeBestCtas();
      const categories = result.patterns.map((p) => p.category);

      expect(categories).toContain('book-now');
      expect(categories).toContain('contact-us');
      expect(categories).toContain('download');
      expect(categories).toContain('get-started');
      expect(categories).toContain('learn-more');
      expect(categories).toContain('shop-now');
      expect(categories).toContain('sign-up');
      expect(categories).toContain('try-free');
    });

    it('should return correct CTA metrics from DB', async () => {
      mockAggregate
        .mockResolvedValueOnce([
          { avgConversionRate: 0.12, avgCtr: 0.08, sampleSize: 200 },
        ])
        .mockResolvedValue([]);

      const result = await service.computeBestCtas();

      const bookNow = result.patterns.find((p) => p.category === 'book-now');
      expect(bookNow?.avgCtr).toBe(0.08);
      expect(bookNow?.avgConversionRate).toBe(0.12);
      expect(bookNow?.sampleSize).toBe(200);
    });

    it('should filter by industry when provided', async () => {
      mockAggregate.mockResolvedValue([]);

      await service.computeBestCtas('saas');

      const firstCallPipeline = mockAggregate.mock.calls[0][0];
      expect(firstCallPipeline[0].$match.industry).toBe('saas');
    });

    it('should handle errors gracefully per CTA category', async () => {
      mockAggregate.mockRejectedValue(new Error('timeout'));

      const result = await service.computeBestCtas();

      expect(result.patterns).toHaveLength(8);
      expect(result.sampleSize).toBe(0);
      expect(mockLoggerService.error).toHaveBeenCalledTimes(8);
    });

    it('should accumulate sampleSize across categories', async () => {
      mockAggregate
        .mockResolvedValueOnce([
          { avgConversionRate: 0.1, avgCtr: 0.05, sampleSize: 40 },
        ])
        .mockResolvedValueOnce([
          { avgConversionRate: 0.15, avgCtr: 0.06, sampleSize: 60 },
        ])
        .mockResolvedValue([]);

      const result = await service.computeBestCtas();
      expect(result.sampleSize).toBe(100);
    });
  });

  // ─── computeOptimalSpend ────────────────────────────────────────────────────

  describe('computeOptimalSpend', () => {
    it('should return empty buckets when no data', async () => {
      mockAggregate.mockResolvedValue([]);

      const result = await service.computeOptimalSpend();

      expect(result.buckets).toHaveLength(0);
      expect(result.sampleSize).toBe(0);
    });

    it('should map bucket _id to correct range labels', async () => {
      mockAggregate.mockResolvedValue([
        { _id: 0, avgPerformanceScore: 70, avgRoas: 2.0, sampleSize: 50 },
        { _id: 50, avgPerformanceScore: 75, avgRoas: 2.5, sampleSize: 100 },
        { _id: 200, avgPerformanceScore: 80, avgRoas: 3.0, sampleSize: 80 },
        { _id: 500, avgPerformanceScore: 85, avgRoas: 3.5, sampleSize: 60 },
        { _id: 1000, avgPerformanceScore: 90, avgRoas: 4.0, sampleSize: 40 },
        {
          _id: 'overflow',
          avgPerformanceScore: 88,
          avgRoas: 3.8,
          sampleSize: 20,
        },
      ]);

      const result = await service.computeOptimalSpend();

      expect(result.buckets[0].range).toBe('$0-50/day');
      expect(result.buckets[1].range).toBe('$50-200/day');
      expect(result.buckets[2].range).toBe('$200-500/day');
      expect(result.buckets[3].range).toBe('$500-1000/day');
      expect(result.buckets[4].range).toBe('$1000+/day');
      expect(result.buckets[5].range).toBe('$1000+/day'); // overflow alias
    });

    it('should round avgPerformanceScore and avgRoas to 2 decimal places', async () => {
      mockAggregate.mockResolvedValue([
        {
          _id: 0,
          avgPerformanceScore: 70.1234,
          avgRoas: 2.5678,
          sampleSize: 50,
        },
      ]);

      const result = await service.computeOptimalSpend();

      expect(result.buckets[0].avgPerformanceScore).toBe(70.12);
      expect(result.buckets[0].avgRoas).toBe(2.57);
    });

    it('should sum sampleSize across buckets', async () => {
      mockAggregate.mockResolvedValue([
        { _id: 0, avgPerformanceScore: 70, avgRoas: 2.0, sampleSize: 50 },
        { _id: 50, avgPerformanceScore: 75, avgRoas: 2.5, sampleSize: 100 },
      ]);

      const result = await service.computeOptimalSpend();
      expect(result.sampleSize).toBe(150);
    });

    it('should filter by platform when provided', async () => {
      mockAggregate.mockResolvedValue([]);

      await service.computeOptimalSpend('meta');

      const pipeline = mockAggregate.mock.calls[0][0];
      expect(pipeline[0].$match.adPlatform).toBe('meta');
    });

    it('should filter by industry when provided', async () => {
      mockAggregate.mockResolvedValue([]);

      await service.computeOptimalSpend(undefined, 'retail');

      const pipeline = mockAggregate.mock.calls[0][0];
      expect(pipeline[0].$match.industry).toBe('retail');
    });

    it('should filter by both platform and industry', async () => {
      mockAggregate.mockResolvedValue([]);

      await service.computeOptimalSpend('google', 'finance');

      const pipeline = mockAggregate.mock.calls[0][0];
      expect(pipeline[0].$match.adPlatform).toBe('google');
      expect(pipeline[0].$match.industry).toBe('finance');
    });

    it('should handle aggregate errors gracefully', async () => {
      mockAggregate.mockRejectedValue(new Error('connection lost'));

      const result = await service.computeOptimalSpend();

      expect(result.buckets).toHaveLength(0);
      expect(result.sampleSize).toBe(0);
      expect(mockLoggerService.error).toHaveBeenCalledOnce();
    });

    it('should use fallback label for unknown bucket _id', async () => {
      mockAggregate.mockResolvedValue([
        { _id: 9999, avgPerformanceScore: 60, avgRoas: 1.5, sampleSize: 10 },
      ]);

      const result = await service.computeOptimalSpend();
      expect(result.buckets[0].range).toBe('$9999+/day');
    });
  });

  // ─── computePlatformBenchmarks ──────────────────────────────────────────────

  describe('computePlatformBenchmarks', () => {
    it('should return empty benchmarks when no data', async () => {
      mockAggregate.mockResolvedValue([]);

      const result = await service.computePlatformBenchmarks();

      expect(result.meta).toEqual({
        avgCpa: 0,
        avgCpc: 0,
        avgCtr: 0,
        avgRoas: 0,
        sampleSize: 0,
      });
      expect(result.google).toEqual({
        avgCpa: 0,
        avgCpc: 0,
        avgCtr: 0,
        avgRoas: 0,
        sampleSize: 0,
      });
      expect(result.tiktok).toEqual({
        avgCpa: 0,
        avgCpc: 0,
        avgCtr: 0,
        avgRoas: 0,
        sampleSize: 0,
      });
      expect(result.sampleSize).toBe(0);
    });

    it('should map platform data correctly', async () => {
      mockAggregate.mockResolvedValue([
        {
          _id: 'meta',
          avgCpa: 15.5,
          avgCpc: 1.2,
          avgCtr: 0.05,
          avgRoas: 3.0,
          sampleSize: 200,
        },
        {
          _id: 'google',
          avgCpa: 20.0,
          avgCpc: 2.5,
          avgCtr: 0.03,
          avgRoas: 2.5,
          sampleSize: 150,
        },
        {
          _id: 'tiktok',
          avgCpa: 12.0,
          avgCpc: 0.8,
          avgCtr: 0.08,
          avgRoas: 3.5,
          sampleSize: 100,
        },
      ]);

      const result = await service.computePlatformBenchmarks();

      expect(result.meta).toEqual({
        avgCpa: 15.5,
        avgCpc: 1.2,
        avgCtr: 0.05,
        avgRoas: 3.0,
        sampleSize: 200,
      });
      expect(result.google).toEqual({
        avgCpa: 20.0,
        avgCpc: 2.5,
        avgCtr: 0.03,
        avgRoas: 2.5,
        sampleSize: 150,
      });
      expect(result.tiktok).toEqual({
        avgCpa: 12.0,
        avgCpc: 0.8,
        avgCtr: 0.08,
        avgRoas: 3.5,
        sampleSize: 100,
      });
      expect(result.sampleSize).toBe(450);
    });

    it('should provide defaults for missing platforms', async () => {
      mockAggregate.mockResolvedValue([
        {
          _id: 'meta',
          avgCpa: 15.5,
          avgCpc: 1.2,
          avgCtr: 0.05,
          avgRoas: 3.0,
          sampleSize: 200,
        },
      ]);

      const result = await service.computePlatformBenchmarks();

      expect(result.google).toEqual({
        avgCpa: 0,
        avgCpc: 0,
        avgCtr: 0,
        avgRoas: 0,
        sampleSize: 0,
      });
      expect(result.tiktok).toEqual({
        avgCpa: 0,
        avgCpc: 0,
        avgCtr: 0,
        avgRoas: 0,
        sampleSize: 0,
      });
    });

    it('should filter by industry when provided', async () => {
      mockAggregate.mockResolvedValue([]);

      await service.computePlatformBenchmarks('healthcare');

      const pipeline = mockAggregate.mock.calls[0][0];
      expect(pipeline[0].$match.industry).toBe('healthcare');
    });

    it('should handle aggregate errors gracefully', async () => {
      mockAggregate.mockRejectedValue(new Error('timeout'));

      const result = await service.computePlatformBenchmarks();

      expect(result.meta).toEqual({
        avgCpa: 0,
        avgCpc: 0,
        avgCtr: 0,
        avgRoas: 0,
        sampleSize: 0,
      });
      expect(result.google).toEqual({
        avgCpa: 0,
        avgCpc: 0,
        avgCtr: 0,
        avgRoas: 0,
        sampleSize: 0,
      });
      expect(result.tiktok).toEqual({
        avgCpa: 0,
        avgCpc: 0,
        avgCtr: 0,
        avgRoas: 0,
        sampleSize: 0,
      });
      expect(result.sampleSize).toBe(0);
      expect(mockLoggerService.error).toHaveBeenCalledOnce();
    });
  });

  // ─── computeIndustryBenchmarks ──────────────────────────────────────────────

  describe('computeIndustryBenchmarks', () => {
    it('should return empty industries when no data', async () => {
      mockAggregate.mockResolvedValue([]);

      const result = await service.computeIndustryBenchmarks();

      expect(result.industries).toHaveLength(0);
      expect(result.sampleSize).toBe(0);
    });

    it('should map industry data correctly', async () => {
      mockAggregate.mockResolvedValue([
        {
          _id: 'ecommerce',
          avgCpa: 18.0,
          avgCpc: 1.5,
          avgCtr: 0.04,
          avgRoas: 2.8,
          sampleSize: 300,
        },
        {
          _id: 'saas',
          avgCpa: 40.0,
          avgCpc: 3.0,
          avgCtr: 0.02,
          avgRoas: 4.0,
          sampleSize: 200,
        },
      ]);

      const result = await service.computeIndustryBenchmarks();

      expect(result.industries).toHaveLength(2);
      expect(result.industries[0]).toEqual({
        avgCpa: 18.0,
        avgCpc: 1.5,
        avgCtr: 0.04,
        avgRoas: 2.8,
        industry: 'ecommerce',
        sampleSize: 300,
      });
      expect(result.sampleSize).toBe(500);
    });

    it('should use _id as the industry field name', async () => {
      mockAggregate.mockResolvedValue([
        {
          _id: 'retail',
          avgCpa: 10.0,
          avgCpc: 1.0,
          avgCtr: 0.05,
          avgRoas: 3.0,
          sampleSize: 100,
        },
      ]);

      const result = await service.computeIndustryBenchmarks();
      expect(result.industries[0].industry).toBe('retail');
    });

    it('should handle aggregate errors gracefully', async () => {
      mockAggregate.mockRejectedValue(new Error('query failed'));

      const result = await service.computeIndustryBenchmarks();

      expect(result.industries).toHaveLength(0);
      expect(result.sampleSize).toBe(0);
      expect(mockLoggerService.error).toHaveBeenCalledOnce();
    });

    it('should sum sampleSizes across all industries', async () => {
      mockAggregate.mockResolvedValue([
        {
          _id: 'a',
          avgCpa: 5.0,
          avgCpc: 1.0,
          avgCtr: 0.01,
          avgRoas: 2.0,
          sampleSize: 100,
        },
        {
          _id: 'b',
          avgCpa: 10.0,
          avgCpc: 2.0,
          avgCtr: 0.02,
          avgRoas: 3.0,
          sampleSize: 200,
        },
        {
          _id: 'c',
          avgCpa: 15.0,
          avgCpc: 3.0,
          avgCtr: 0.03,
          avgRoas: 4.0,
          sampleSize: 300,
        },
      ]);

      const result = await service.computeIndustryBenchmarks();
      expect(result.sampleSize).toBe(600);
    });
  });
});
