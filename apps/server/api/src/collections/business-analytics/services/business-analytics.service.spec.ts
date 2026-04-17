import { BusinessAnalyticsService } from '@api/collections/business-analytics/services/business-analytics.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { StripeService } from '@api/services/integrations/stripe/services/stripe.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  type CreditTransaction as CreditTransactions,
  type Ingredient,
} from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';

describe('BusinessAnalyticsService', () => {
  let service: BusinessAnalyticsService;
  let stripeService: vi.Mocked<StripeService>;
  let loggerService: vi.Mocked<LoggerService>;
  let creditTransactionsModel: Record<string, ReturnType<typeof vi.fn>>;
  let ingredientModel: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(async () => {
    loggerService = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as vi.Mocked<LoggerService>;

    stripeService = {
      stripe: {
        charges: {
          list: vi.fn().mockResolvedValue({
            data: [],
            has_more: false,
          }),
        },
      },
    } as unknown as vi.Mocked<StripeService>;

    creditTransactionsModel = {
      aggregate: vi.fn().mockResolvedValue([]),
    };

    ingredientModel = {
      aggregate: vi.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BusinessAnalyticsService,
        { provide: LoggerService, useValue: loggerService },
        { provide: StripeService, useValue: stripeService },
        {
          provide: PrismaService,
          useValue: { ...creditTransactionsModel, ...ingredientModel },
        },
      ],
    }).compile();

    service = module.get<BusinessAnalyticsService>(BusinessAnalyticsService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getBusinessAnalytics', () => {
    it('should return combined analytics data', async () => {
      const result = await service.getBusinessAnalytics();

      expect(result).toHaveProperty('revenue');
      expect(result).toHaveProperty('credits');
      expect(result).toHaveProperty('ingredients');
    });

    it('should return revenue with daily series for 30 days', async () => {
      const result = await service.getBusinessAnalytics();

      expect(result.revenue.dailySeries).toHaveLength(30);
      expect(result.revenue.dailySeries[0]).toHaveProperty('date');
      expect(result.revenue.dailySeries[0]).toHaveProperty('revenue');
      expect(result.revenue.dailySeries[0]).toHaveProperty('count');
    });

    it('should return zero revenue when stripe returns empty charges', async () => {
      const result = await service.getBusinessAnalytics();

      expect(result.revenue.revenueToday).toBe(0);
      expect(result.revenue.revenue7d).toBe(0);
      expect(result.revenue.revenue30d).toBe(0);
      expect(result.revenue.revenueMtd).toBe(0);
      expect(result.revenue.creditsSoldTotal).toBe(0);
      expect(result.revenue.wowGrowth).toBe(0);
    });

    it('should compute revenue from stripe charges', async () => {
      const now = Math.floor(Date.now() / 1000);
      stripeService.stripe.charges.list = vi.fn().mockResolvedValue({
        data: [
          {
            amount: 9900, // $99.00
            created: now - 3600, // 1 hour ago
            id: 'ch_1',
            metadata: { credits: '35000' },
            paid: true,
            refunded: false,
          },
          {
            amount: 4900, // $49.00
            created: now - 86400 * 3, // 3 days ago
            id: 'ch_2',
            metadata: {},
            paid: true,
            refunded: false,
          },
        ],
        has_more: false,
      }) as ReturnType<typeof vi.fn>;

      const result = await service.getBusinessAnalytics();

      expect(result.revenue.revenue30d).toBe(148);
      expect(result.revenue.revenue7d).toBe(148);
      expect(result.revenue.revenueToday).toBe(99);
      expect(result.revenue.creditsSoldTotal).toBe(35000);
    });

    it('should filter out refunded charges', async () => {
      const now = Math.floor(Date.now() / 1000);
      stripeService.stripe.charges.list = vi.fn().mockResolvedValue({
        data: [
          {
            amount: 5000,
            created: now - 3600,
            id: 'ch_1',
            metadata: {},
            paid: true,
            refunded: true, // refunded
          },
          {
            amount: 3000,
            created: now - 3600,
            id: 'ch_2',
            metadata: {},
            paid: true,
            refunded: false,
          },
        ],
        has_more: false,
      }) as ReturnType<typeof vi.fn>;

      const result = await service.getBusinessAnalytics();

      expect(result.revenue.revenue30d).toBe(30); // Only ch_2 counted
    });

    it('should aggregate credit consumption from MongoDB', async () => {
      creditTransactionsModel.aggregate
        .mockResolvedValueOnce([
          { _id: null, total7d: 45000, total30d: 180000, totalWeek1: 40000 },
        ])
        .mockResolvedValueOnce([
          { _id: '2026-03-29', count: 42, creditsConsumed: 6500 },
        ])
        .mockResolvedValueOnce([
          { _id: 0, amount: 100000, count: 500, source: 'image_generation' },
        ])
        .mockResolvedValueOnce([
          {
            _id: 'org_1',
            creditsConsumed: 50000,
            organizationId: 'org_1',
            transactionCount: 200,
          },
        ]);

      const result = await service.getBusinessAnalytics();

      expect(result.credits.totalConsumed30d).toBe(180000);
      expect(result.credits.totalConsumed7d).toBe(45000);
      expect(result.credits.wowGrowth).toBe(12.5); // (45000-40000)/40000 * 100
    });

    it('should aggregate ingredients from MongoDB', async () => {
      ingredientModel.aggregate
        .mockResolvedValueOnce([
          { _id: null, total7d: 350, total30d: 1200, totalWeek1: 300 },
        ])
        .mockResolvedValueOnce([{ _id: '2026-03-29', count: 55 }])
        .mockResolvedValueOnce([
          { _id: 0, category: 'image', count: 800 },
          { _id: 0, category: 'video', count: 250 },
        ])
        .mockResolvedValueOnce([
          { _id: 'org_1', ingredientCount: 400, organizationId: 'org_1' },
        ]);

      const result = await service.getBusinessAnalytics();

      expect(result.ingredients.total30d).toBe(1200);
      expect(result.ingredients.total7d).toBe(350);
      expect(result.ingredients.wowGrowth).toBe(16.67); // (350-300)/300 * 100
    });

    it('should handle stripe errors gracefully', async () => {
      stripeService.stripe.charges.list = vi
        .fn()
        .mockRejectedValue(new Error('Stripe API error')) as ReturnType<
        typeof vi.fn
      >;

      const result = await service.getBusinessAnalytics();

      expect(result.revenue.revenueToday).toBe(0);
      expect(result.revenue.revenue30d).toBe(0);
      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('getRevenueSummary failed'),
        expect.any(Error),
      );
    });

    it('should handle credit aggregation errors gracefully', async () => {
      creditTransactionsModel.aggregate.mockRejectedValue(
        new Error('MongoDB error'),
      );

      const result = await service.getBusinessAnalytics();

      expect(result.credits.totalConsumed30d).toBe(0);
      expect(result.credits.totalConsumed7d).toBe(0);
      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('getCreditConsumptionSummary failed'),
        expect.any(Error),
      );
    });

    it('should handle ingredient aggregation errors gracefully', async () => {
      ingredientModel.aggregate.mockRejectedValue(new Error('MongoDB error'));

      const result = await service.getBusinessAnalytics();

      expect(result.ingredients.total30d).toBe(0);
      expect(result.ingredients.total7d).toBe(0);
      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('getIngredientSummary failed'),
        expect.any(Error),
      );
    });

    it('should paginate stripe charges when has_more is true', async () => {
      const now = Math.floor(Date.now() / 1000);
      const listFn = vi
        .fn()
        .mockResolvedValueOnce({
          data: [
            {
              amount: 5000,
              created: now - 3600,
              id: 'ch_1',
              metadata: {},
              paid: true,
              refunded: false,
            },
          ],
          has_more: true,
        })
        .mockResolvedValueOnce({
          data: [
            {
              amount: 3000,
              created: now - 7200,
              id: 'ch_2',
              metadata: {},
              paid: true,
              refunded: false,
            },
          ],
          has_more: false,
        });
      stripeService.stripe.charges.list = listFn as ReturnType<typeof vi.fn>;

      const result = await service.getBusinessAnalytics();

      expect(listFn).toHaveBeenCalledTimes(2);
      expect(result.revenue.revenue30d).toBe(80); // $50 + $30
    });

    it('should return credits daily series with 30 entries', async () => {
      const result = await service.getBusinessAnalytics();

      expect(result.credits.dailySeries).toHaveLength(30);
    });

    it('should return ingredients daily series with 30 entries', async () => {
      const result = await service.getBusinessAnalytics();

      expect(result.ingredients.dailySeries).toHaveLength(30);
    });
  });
});
