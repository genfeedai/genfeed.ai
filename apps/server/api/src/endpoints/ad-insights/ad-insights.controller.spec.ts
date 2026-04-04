import { AdInsightsController } from '@api/endpoints/ad-insights/ad-insights.controller';
import { AdAggregationService } from '@api/services/ad-aggregation/ad-aggregation.service';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeSingle: vi.fn(
    (_req: Request, _serializer: unknown, data: unknown) => ({
      data: { attributes: data, id: 'mock-id', type: 'ad-insight' },
    }),
  ),
}));

const makeRequest = (): Partial<Request> => ({ headers: {}, url: '/test' });

describe('AdInsightsController', () => {
  let controller: AdInsightsController;
  let adAggregationService: {
    computeBestCtas: ReturnType<typeof vi.fn>;
    computeOptimalSpend: ReturnType<typeof vi.fn>;
    computePlatformBenchmarks: ReturnType<typeof vi.fn>;
    computeTopHeadlines: ReturnType<typeof vi.fn>;
  };

  const mockInsightResult = { insights: [{ headline: 'Buy now', score: 95 }] };

  beforeEach(async () => {
    adAggregationService = {
      computeBestCtas: vi.fn().mockResolvedValue(mockInsightResult),
      computeOptimalSpend: vi.fn().mockResolvedValue(mockInsightResult),
      computePlatformBenchmarks: vi.fn().mockResolvedValue(mockInsightResult),
      computeTopHeadlines: vi.fn().mockResolvedValue(mockInsightResult),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdInsightsController],
      providers: [
        {
          provide: AdAggregationService,
          useValue: adAggregationService,
        },
      ],
    }).compile();

    controller = module.get<AdInsightsController>(AdInsightsController);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ─── getTopHeadlines ─────────────────────────────────────────────────────

  describe('getTopHeadlines', () => {
    it('calls computeTopHeadlines with the given industry', async () => {
      await controller.getTopHeadlines(makeRequest() as Request, 'fashion');
      expect(adAggregationService.computeTopHeadlines).toHaveBeenCalledWith(
        'fashion',
      );
    });

    it('calls computeTopHeadlines with undefined when industry is omitted', async () => {
      await controller.getTopHeadlines(makeRequest() as Request, undefined);
      expect(adAggregationService.computeTopHeadlines).toHaveBeenCalledWith(
        undefined,
      );
    });

    it('returns serialized response', async () => {
      const result = await controller.getTopHeadlines(
        makeRequest() as Request,
        'tech',
      );
      expect(result).toHaveProperty('data');
    });
  });

  // ─── getBestCtas ─────────────────────────────────────────────────────────

  describe('getBestCtas', () => {
    it('calls computeBestCtas with the given industry', async () => {
      await controller.getBestCtas(makeRequest() as Request, 'saas');
      expect(adAggregationService.computeBestCtas).toHaveBeenCalledWith('saas');
    });

    it('returns serialized response', async () => {
      const result = await controller.getBestCtas(makeRequest() as Request);
      expect(result).toHaveProperty('data');
    });
  });

  // ─── getBenchmarks ───────────────────────────────────────────────────────

  describe('getBenchmarks', () => {
    it('calls computePlatformBenchmarks with industry', async () => {
      await controller.getBenchmarks(
        makeRequest() as Request,
        'retail',
        'instagram',
      );
      expect(
        adAggregationService.computePlatformBenchmarks,
      ).toHaveBeenCalledWith('retail');
    });

    it('returns serialized response', async () => {
      const result = await controller.getBenchmarks(makeRequest() as Request);
      expect(result).toHaveProperty('data');
    });
  });

  // ─── getSpendOptimization ────────────────────────────────────────────────

  describe('getSpendOptimization', () => {
    it('calls computeOptimalSpend with platform and industry', async () => {
      await controller.getSpendOptimization(
        makeRequest() as Request,
        'instagram',
        'fashion',
      );
      expect(adAggregationService.computeOptimalSpend).toHaveBeenCalledWith(
        'instagram',
        'fashion',
      );
    });

    it('calls computeOptimalSpend with undefined when params omitted', async () => {
      await controller.getSpendOptimization(
        makeRequest() as Request,
        undefined,
        undefined,
      );
      expect(adAggregationService.computeOptimalSpend).toHaveBeenCalledWith(
        undefined,
        undefined,
      );
    });
  });

  // ─── generateVariations ──────────────────────────────────────────────────

  describe('generateVariations', () => {
    it('returns count 5 and empty variations by default', () => {
      const result = controller.generateVariations({}) as {
        count: number;
        platform: string;
        variations: unknown[];
      };
      expect(result.count).toBe(5);
      expect(result.platform).toBe('all');
      expect(result.variations).toEqual([]);
    });

    it('uses provided count and platform', () => {
      const result = controller.generateVariations({
        count: 3,
        platform: 'facebook',
      }) as { count: number; platform: string };
      expect(result.count).toBe(3);
      expect(result.platform).toBe('facebook');
    });
  });

  // ─── suggestHeadlines ────────────────────────────────────────────────────

  describe('suggestHeadlines', () => {
    it('returns platform all and empty suggestions by default', () => {
      const result = controller.suggestHeadlines({}) as {
        platform: string;
        suggestions: unknown[];
      };
      expect(result.platform).toBe('all');
      expect(result.suggestions).toEqual([]);
    });

    it('includes provided industry', () => {
      const result = controller.suggestHeadlines({ industry: 'beauty' }) as {
        industry: string;
      };
      expect(result.industry).toBe('beauty');
    });
  });
});
