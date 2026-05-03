import { CreditsController } from '@api/collections/credits/controllers/credits.controller';
import { CreditTransactionsService } from '@api/collections/credits/services/credit-transactions.service';
import { TopbarBalancesService } from '@api/collections/credits/services/topbar-balances.service';
import { RATE_LIMIT_KEY } from '@api/shared/decorators/rate-limit/rate-limit.decorator';
import type { User } from '@clerk/backend';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('CreditsController', () => {
  let controller: CreditsController;
  let _creditTransactionsService: CreditTransactionsService;

  const mockUser = {
    id: 'user_123',
    publicMetadata: {
      brand: '507f1f77bcf86cd799439013',
      organization: '507f1f77bcf86cd799439012',
      user: '507f1f77bcf86cd799439011',
    },
  } as unknown as User;

  const mockUsageMetrics = {
    breakdown: [
      { amount: 200, count: 20, source: 'generation' },
      { amount: 100, count: 10, source: 'publishing' },
    ],
    currentBalance: 1000,
    trendPercentage: 5.5,
    usage7Days: 70,
    usage30Days: 300,
  };

  const mockServices = {
    creditTransactionsService: {
      getLastPurchaseBaseline: vi.fn().mockResolvedValue({
        currentBalance: 900,
        lastPurchaseAt: new Date('2026-03-01T00:00:00.000Z'),
        lastPurchaseCredits: 1000,
        usedPercent: 10,
        usedSinceLastPurchase: 100,
      }),
      getUsageMetrics: vi.fn().mockResolvedValue(mockUsageMetrics),
    },
    loggerService: {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    },
    topbarBalancesService: {
      getTopbarBalances: vi.fn().mockResolvedValue({
        generatedAt: '2026-05-02T12:00:00.000Z',
        segments: [
          {
            balance: 1000,
            currencyOrUnit: 'credits',
            label: 'Genfeed',
            lastSyncedAt: '2026-05-02T12:00:00.000Z',
            provider: 'genfeed',
            status: 'available',
          },
        ],
      }),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CreditsController],
      providers: [
        {
          provide: CreditTransactionsService,
          useValue: mockServices.creditTransactionsService,
        },
        {
          provide: TopbarBalancesService,
          useValue: mockServices.topbarBalancesService,
        },
        { provide: LoggerService, useValue: mockServices.loggerService },
      ],
    }).compile();

    controller = module.get<CreditsController>(CreditsController);
    _creditTransactionsService = module.get<CreditTransactionsService>(
      CreditTransactionsService,
    );
  });

  const mockReq = { originalUrl: '/credits/usage' } as Request;

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should have rate limit on getUsageMetrics endpoint', () => {
    const metadata = Reflect.getMetadata(
      RATE_LIMIT_KEY,
      CreditsController.prototype.getUsageMetrics,
    );
    expect(metadata).toEqual({ limit: 20, scope: 'user', windowMs: 60000 });
  });

  it('should have rate limit on getByokUsageSummary endpoint', () => {
    const metadata = Reflect.getMetadata(
      RATE_LIMIT_KEY,
      CreditsController.prototype.getByokUsageSummary,
    );
    expect(metadata).toEqual({ limit: 20, scope: 'user', windowMs: 60000 });
  });

  it('should have rate limit on getLastPurchaseBaseline endpoint', () => {
    const metadata = Reflect.getMetadata(
      RATE_LIMIT_KEY,
      CreditsController.prototype.getLastPurchaseBaseline,
    );
    expect(metadata).toEqual({ limit: 20, scope: 'user', windowMs: 60000 });
  });

  it('should have rate limit on getTopbarBalances endpoint', () => {
    const metadata = Reflect.getMetadata(
      RATE_LIMIT_KEY,
      CreditsController.prototype.getTopbarBalances,
    );
    expect(metadata).toEqual({ limit: 30, scope: 'user', windowMs: 60000 });
  });

  describe('getUsageMetrics', () => {
    it('should return usage metrics', async () => {
      const result = await controller.getUsageMetrics(mockReq, mockUser);

      expect(
        mockServices.creditTransactionsService.getUsageMetrics,
      ).toHaveBeenCalledWith('507f1f77bcf86cd799439012');
      expect(result).toBeDefined();
    });

    it('should call service with correct organization ID', async () => {
      await controller.getUsageMetrics(mockReq, mockUser);

      expect(
        mockServices.creditTransactionsService.getUsageMetrics,
      ).toHaveBeenCalledWith('507f1f77bcf86cd799439012');
    });

    it('should return serialized metrics response', async () => {
      const result = await controller.getUsageMetrics(mockReq, mockUser);

      expect(result).toBeDefined();
      expect(
        mockServices.creditTransactionsService.getUsageMetrics,
      ).toHaveBeenCalledTimes(1);
    });
  });

  describe('getLastPurchaseBaseline', () => {
    it('should return baseline metrics', async () => {
      const result = await controller.getLastPurchaseBaseline(
        mockReq,
        mockUser,
      );

      expect(
        mockServices.creditTransactionsService.getLastPurchaseBaseline,
      ).toHaveBeenCalledWith('507f1f77bcf86cd799439012');
      expect(result).toBeDefined();
    });
  });

  describe('getTopbarBalances', () => {
    it('returns serialized topbar balances for the current organization', async () => {
      const result = await controller.getTopbarBalances(mockReq, mockUser);

      expect(
        mockServices.topbarBalancesService.getTopbarBalances,
      ).toHaveBeenCalledWith('507f1f77bcf86cd799439012');
      expect(result).toBeDefined();
    });
  });
});
