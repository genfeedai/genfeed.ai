import { BusinessAnalyticsService } from '@api/endpoints/analytics/business-analytics.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  type CreditTransaction as CreditTransactions,
  type Ingredient,
  type Organization,
} from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';

describe('BusinessAnalyticsService', () => {
  let service: BusinessAnalyticsService;

  const mockAggregateExec = vi.fn().mockResolvedValue([]);
  const mockAggregate = vi.fn().mockReturnValue({ exec: mockAggregateExec });
  const mockCountDocuments = vi.fn().mockResolvedValue(0);
  const mockFindLean = vi.fn().mockResolvedValue([]);
  const mockFind = vi.fn().mockReturnValue({ lean: mockFindLean });

  const mockCreditTransactionModel = {
    aggregate: mockAggregate,
  };

  const mockIngredientModel = {
    aggregate: mockAggregate,
    countDocuments: mockCountDocuments,
  };

  const mockOrganizationModel = {
    find: mockFind,
  };

  const mockLoggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BusinessAnalyticsService,
        {
          provide: PrismaService,
          useValue: {
            ...mockCreditTransactionModel,
            ...mockIngredientModel,
            ...mockOrganizationModel,
          },
        },
        {
          provide: LoggerService,
          useValue: mockLoggerService,
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
    it('should return a complete business analytics response with empty data', async () => {
      mockAggregateExec.mockResolvedValue([]);
      mockCountDocuments.mockResolvedValue(0);
      mockFindLean.mockResolvedValue([]);

      const result = await service.getBusinessAnalytics();

      expect(result).toBeDefined();
      expect(result.revenue).toBeDefined();
      expect(result.credits).toBeDefined();
      expect(result.ingredients).toBeDefined();
      expect(result.leaders).toBeDefined();
      expect(result.projections).toBeDefined();
      expect(result.comparisons).toBeDefined();
    });

    it('should return revenue fields with correct shape', async () => {
      mockAggregateExec.mockResolvedValue([]);
      mockCountDocuments.mockResolvedValue(0);
      mockFindLean.mockResolvedValue([]);

      const result = await service.getBusinessAnalytics();

      expect(result.revenue).toEqual(
        expect.objectContaining({
          last7d: expect.any(Number),
          last30d: expect.any(Number),
          mtd: expect.any(Number),
          today: expect.any(Number),
          wowGrowth: expect.any(Number),
        }),
      );
      expect(Array.isArray(result.revenue.dailySeries)).toBe(true);
    });

    it('should return credits fields with correct shape', async () => {
      mockAggregateExec.mockResolvedValue([]);
      mockCountDocuments.mockResolvedValue(0);
      mockFindLean.mockResolvedValue([]);

      const result = await service.getBusinessAnalytics();

      expect(result.credits).toEqual(
        expect.objectContaining({
          consumed: expect.any(Number),
          sold: expect.any(Number),
          wowGrowth: expect.any(Number),
        }),
      );
      expect(Array.isArray(result.credits.dailySoldSeries)).toBe(true);
      expect(Array.isArray(result.credits.dailyConsumedSeries)).toBe(true);
    });

    it('should return ingredients fields with correct shape', async () => {
      mockAggregateExec.mockResolvedValue([]);
      mockCountDocuments.mockResolvedValue(0);
      mockFindLean.mockResolvedValue([]);

      const result = await service.getBusinessAnalytics();

      expect(result.ingredients).toEqual(
        expect.objectContaining({
          last7d: expect.any(Number),
          last30d: expect.any(Number),
          today: expect.any(Number),
          wowGrowth: expect.any(Number),
        }),
      );
      expect(Array.isArray(result.ingredients.dailySeries)).toBe(true);
      expect(Array.isArray(result.ingredients.categoryBreakdown)).toBe(true);
    });

    it('should return leaders with empty arrays when no data', async () => {
      mockAggregateExec.mockResolvedValue([]);
      mockCountDocuments.mockResolvedValue(0);
      mockFindLean.mockResolvedValue([]);

      const result = await service.getBusinessAnalytics();

      expect(result.leaders.byRevenue).toEqual([]);
      expect(result.leaders.byCredits).toEqual([]);
      expect(result.leaders.byIngredients).toEqual([]);
    });

    it('should mark projections as insufficient when no data', async () => {
      mockAggregateExec.mockResolvedValue([]);
      mockCountDocuments.mockResolvedValue(0);
      mockFindLean.mockResolvedValue([]);

      const result = await service.getBusinessAnalytics();

      expect(result.projections.insufficientData).toBe(true);
      expect(result.projections.isEstimate).toBe(true);
    });

    it('should return comparisons with zero values when no data', async () => {
      mockAggregateExec.mockResolvedValue([]);
      mockCountDocuments.mockResolvedValue(0);
      mockFindLean.mockResolvedValue([]);

      const result = await service.getBusinessAnalytics();

      expect(result.comparisons.outstandingPrepaid).toBe(0);
      expect(result.comparisons.soldVsConsumed.sold).toBe(0);
      expect(result.comparisons.soldVsConsumed.consumed).toBe(0);
    });

    it('should aggregate credit transactions with correct category filters', async () => {
      mockAggregateExec.mockResolvedValue([]);
      mockCountDocuments.mockResolvedValue(0);
      mockFindLean.mockResolvedValue([]);

      await service.getBusinessAnalytics();

      // Should have called aggregate multiple times for revenue, credits, and leaders
      expect(mockAggregate).toHaveBeenCalled();
    });

    it('should handle non-zero revenue data', async () => {
      // Return non-zero totals for ADD transactions
      mockAggregateExec
        .mockResolvedValueOnce([{ total: 5000 }]) // revenue today
        .mockResolvedValueOnce([{ total: 25000 }]) // revenue 7d
        .mockResolvedValueOnce([{ total: 100000 }]) // revenue 30d
        .mockResolvedValueOnce([{ total: 80000 }]) // revenue MTD
        .mockResolvedValueOnce([]) // daily series
        .mockResolvedValueOnce([{ total: 25000 }]) // this week
        .mockResolvedValueOnce([{ total: 20000 }]) // last week
        // credits
        .mockResolvedValueOnce([{ total: 50000 }]) // credits sold
        .mockResolvedValueOnce([{ total: 30000 }]) // credits consumed
        .mockResolvedValue([]); // rest returns empty

      mockCountDocuments.mockResolvedValue(0);
      mockFindLean.mockResolvedValue([]);

      const result = await service.getBusinessAnalytics();

      expect(result.revenue.today).toBe(5000);
      expect(result.revenue.last7d).toBe(25000);
    });

    it('should map aggregate inputs into a dashboard-visible analytics response', async () => {
      const dailyRevenueSeries = Array.from({ length: 14 }, (_, index) => ({
        amount: index + 1,
        date: `2026-04-${String(index + 1).padStart(2, '0')}`,
      }));
      const dailySoldSeries = Array.from({ length: 14 }, (_, index) => ({
        amount: (index + 1) * 10,
        date: `2026-04-${String(index + 1).padStart(2, '0')}`,
      }));
      const dailyConsumedSeries = Array.from({ length: 14 }, (_, index) => ({
        amount: (index + 1) * 5,
        date: `2026-04-${String(index + 1).padStart(2, '0')}`,
      }));
      const dailyIngredientSeries = Array.from({ length: 14 }, (_, index) => ({
        count: index + 2,
        date: `2026-04-${String(index + 1).padStart(2, '0')}`,
      }));

      mockAggregateExec
        .mockResolvedValueOnce([{ total: 100 }]) // revenue today
        .mockResolvedValueOnce([{ total: 300 }]) // revenue 7d
        .mockResolvedValueOnce([{ total: 900 }]) // revenue 30d
        .mockResolvedValueOnce([{ total: 700 }]) // revenue mtd
        .mockResolvedValueOnce(dailyRevenueSeries) // revenue daily series
        .mockResolvedValueOnce([{ total: 300 }]) // revenue this week
        .mockResolvedValueOnce([{ total: 150 }]) // revenue last week
        .mockResolvedValueOnce([{ total: 1200 }]) // credits sold
        .mockResolvedValueOnce([{ total: 800 }]) // credits consumed
        .mockResolvedValueOnce(dailySoldSeries) // daily sold series
        .mockResolvedValueOnce(dailyConsumedSeries) // daily consumed series
        .mockResolvedValueOnce([{ total: 200 }]) // consumed this week
        .mockResolvedValueOnce([{ total: 100 }]) // consumed last week
        .mockResolvedValueOnce([{ total: 2 }]) // ingredients today
        .mockResolvedValueOnce([{ total: 7 }]) // ingredients 7d
        .mockResolvedValueOnce([{ total: 20 }]) // ingredients 30d
        .mockResolvedValueOnce(dailyIngredientSeries) // ingredient daily series
        .mockResolvedValueOnce([{ category: 'image', count: 12 }]) // category breakdown
        .mockResolvedValueOnce([{ total: 10 }]) // ingredients this week
        .mockResolvedValueOnce([{ total: 5 }]) // ingredients last week
        .mockResolvedValueOnce([
          { amount: 500, organizationId: 'org-1', organizationName: 'Acme' },
        ]) // leaders by revenue
        .mockResolvedValueOnce([
          { amount: 250, organizationId: 'org-1', organizationName: 'Acme' },
        ]) // leaders by credits
        .mockResolvedValueOnce([]); // leaders by ingredients

      mockCountDocuments.mockResolvedValue(0);
      mockFindLean.mockResolvedValue([]);

      const result = await service.getBusinessAnalytics();

      expect(result.revenue).toMatchObject({
        last7d: 300,
        last30d: 900,
        mtd: 700,
        today: 100,
      });
      expect(result.credits).toMatchObject({
        consumed: 800,
        sold: 1200,
      });
      expect(result.ingredients).toMatchObject({
        last7d: 7,
        last30d: 20,
        today: 2,
      });
      expect(result.leaders.byRevenue[0]).toMatchObject({
        amount: 500,
        organizationId: 'org-1',
        organizationName: 'Acme',
      });
      expect(result.comparisons).toMatchObject({
        cashInVsUsageValue: {
          cashIn: 1200,
          usageValue: 800,
        },
        outstandingPrepaid: 400,
        soldVsConsumed: {
          consumed: 800,
          sold: 1200,
        },
      });
    });
  });
});
