import {
  CreditTransactions,
  type CreditTransactionsDocument,
} from '@api/collections/credits/schemas/credit-transactions.schema';
import { CreditBalanceService } from '@api/collections/credits/services/credit-balance.service';
import { CreditTransactionsService } from '@api/collections/credits/services/credit-transactions.service';
import { CacheInvalidationService } from '@api/common/services/cache-invalidation.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { CreditTransactionCategory } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';

describe('CreditTransactionsService', () => {
  let service: CreditTransactionsService;

  const mockModel = {
    aggregate: vi.fn(),
    aggregatePaginate: vi.fn(),
    collection: { name: 'credit-transactions' },
    find: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    findOne: vi.fn(),
    modelName: 'CreditTransactions',
  } as Record<string, unknown>;

  const mockLogger: Record<string, ReturnType<typeof vi.fn>> = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const mockCreditBalanceService = {
    findByOrganization: vi.fn(),
    getOrCreateBalance: vi.fn(),
  };
  const mockCacheInvalidationService = {
    invalidate: vi.fn(),
  };

  // Mock model as constructor - must use regular function (not arrow) for `new` to work
  const MockModelConstructor = vi.fn().mockImplementation(function (
    data: Record<string, unknown>,
  ) {
    return {
      ...data,
      save: vi.fn().mockResolvedValue({ _id: 'test-object-id', ...data }),
    };
  });

  beforeEach(async () => {
    Object.assign(MockModelConstructor, mockModel);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreditTransactionsService,
        { provide: PrismaService, useValue: MockModelConstructor },
        {
          provide: LoggerService,
          useValue: mockLogger,
        },
        {
          provide: CreditBalanceService,
          useValue: mockCreditBalanceService,
        },
        {
          provide: CacheInvalidationService,
          useValue: mockCacheInvalidationService,
        },
      ],
    }).compile();

    service = module.get<CreditTransactionsService>(CreditTransactionsService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createTransactionEntry', () => {
    it('should create a deduction transaction entry', async () => {
      const orgId = '507f1f77bcf86cd799439011';
      const savedDoc = {
        _id: 'test-object-id',
        amount: 10,
        balanceAfter: 90,
        balanceBefore: 100,
        category: CreditTransactionCategory.DEDUCT,
        organization: new string(orgId),
        source: 'test-source',
      };

      const createSpy = vi
        .spyOn(service, 'create')
        .mockResolvedValue(savedDoc as unknown as CreditTransactionsDocument);

      const result = await service.createTransactionEntry(
        orgId,
        CreditTransactionCategory.DEDUCT,
        10,
        100,
        90,
        'test-source',
        'Test deduction',
      );

      expect(result).toBe(savedDoc);
      expect(createSpy).toHaveBeenCalledTimes(1);
      // Verify create was called with the correct data shape
      const passedEntity = createSpy.mock.calls[0][0];
      expect(passedEntity).toBeDefined();
      expect(passedEntity).toMatchObject({
        amount: 10,
        category: CreditTransactionCategory.DEDUCT,
        source: 'test-source',
      });
    });

    it('should create an add transaction entry', async () => {
      const orgId = '507f1f77bcf86cd799439011';
      const savedDoc = {
        _id: 'test-object-id',
        amount: 500,
        balanceAfter: 600,
        balanceBefore: 100,
        category: CreditTransactionCategory.ADD,
        organization: new string(orgId),
      };

      vi.spyOn(service, 'create').mockResolvedValue(
        savedDoc as unknown as CreditTransactionsDocument,
      );

      const result = await service.createTransactionEntry(
        orgId,
        CreditTransactionCategory.ADD,
        500,
        100,
        600,
      );

      expect(result.category).toBe(CreditTransactionCategory.ADD);
      expect(result.amount).toBe(500);
    });

    it('should create a transaction with expiration date', async () => {
      const orgId = '507f1f77bcf86cd799439011';
      const expiresAt = new Date('2027-01-01');
      const savedDoc = {
        _id: 'test-object-id',
        amount: 100,
        balanceAfter: 200,
        balanceBefore: 100,
        category: CreditTransactionCategory.ADD,
        expiresAt,
        organization: new string(orgId),
      };

      const createSpy = vi
        .spyOn(service, 'create')
        .mockResolvedValue(savedDoc as unknown as CreditTransactionsDocument);

      await service.createTransactionEntry(
        orgId,
        CreditTransactionCategory.ADD,
        100,
        100,
        200,
        'subscription',
        'Monthly credits',
        expiresAt,
      );

      expect(createSpy).toHaveBeenCalledTimes(1);
      // Verify create was called with the correct data shape including expiration
      const passedEntity = createSpy.mock.calls[0][0];
      expect(passedEntity).toBeDefined();
      expect(passedEntity).toMatchObject({
        amount: 100,
        category: CreditTransactionCategory.ADD,
        expiresAt,
      });
    });

    it('should set isDeleted to false on new transactions', async () => {
      const orgId = '507f1f77bcf86cd799439011';
      const createSpy = vi
        .spyOn(service, 'create')
        .mockResolvedValue({} as CreditTransactionsDocument);

      await service.createTransactionEntry(
        orgId,
        CreditTransactionCategory.DEDUCT,
        5,
        100,
        95,
      );

      expect(createSpy).toHaveBeenCalledTimes(1);
      const passedEntity = createSpy.mock.calls[0][0];
      expect(passedEntity.isDeleted).toBe(false);
    });
  });

  describe('getOrganizationTransactions', () => {
    it('should return transactions for organization with defaults', async () => {
      const orgId = '507f1f77bcf86cd799439011';
      const mockTransactions = [
        {
          _id: 'test-object-id',
          amount: 10,
          category: CreditTransactionCategory.DEDUCT,
        },
        {
          _id: 'test-object-id',
          amount: 500,
          category: CreditTransactionCategory.ADD,
        },
      ];

      const execMock = vi.fn().mockResolvedValue(mockTransactions);
      const skipMock = vi.fn().mockReturnValue({ exec: execMock });
      const limitMock = vi.fn().mockReturnValue({ skip: skipMock });
      const sortMock = vi.fn().mockReturnValue({ limit: limitMock });
      (mockModel.find as ReturnType<typeof vi.fn>).mockReturnValue({
        sort: sortMock,
      });

      const result = await service.getOrganizationTransactions(orgId);

      expect(result).toBe(mockTransactions);
      expect(result).toHaveLength(2);
      expect(mockModel.find).toHaveBeenCalledWith({
        isDeleted: { $ne: true },
        organization: new string(orgId),
      });
      expect(sortMock).toHaveBeenCalledWith({ createdAt: -1 });
      expect(limitMock).toHaveBeenCalledWith(100);
      expect(skipMock).toHaveBeenCalledWith(0);
    });

    it('should respect custom limit and skip', async () => {
      const orgId = '507f1f77bcf86cd799439011';
      const execMock = vi.fn().mockResolvedValue([]);
      const skipMock = vi.fn().mockReturnValue({ exec: execMock });
      const limitMock = vi.fn().mockReturnValue({ skip: skipMock });
      const sortMock = vi.fn().mockReturnValue({ limit: limitMock });
      (mockModel.find as ReturnType<typeof vi.fn>).mockReturnValue({
        sort: sortMock,
      });

      await service.getOrganizationTransactions(orgId, 50, 10);

      expect(limitMock).toHaveBeenCalledWith(50);
      expect(skipMock).toHaveBeenCalledWith(10);
    });

    it('should throw and log on error', async () => {
      const orgId = '507f1f77bcf86cd799439011';
      const error = new Error('DB connection lost');
      (mockModel.find as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw error;
      });

      await expect(service.getOrganizationTransactions(orgId)).rejects.toThrow(
        'DB connection lost',
      );
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('getTransactionsByType', () => {
    it('should filter transactions by type', async () => {
      const orgId = '507f1f77bcf86cd799439011';
      const mockTransactions = [
        { _id: 'test-object-id', amount: 10, type: 'generation' },
      ];

      const execMock = vi.fn().mockResolvedValue(mockTransactions);
      const limitMock = vi.fn().mockReturnValue({ exec: execMock });
      const sortMock = vi.fn().mockReturnValue({ limit: limitMock });
      (mockModel.find as ReturnType<typeof vi.fn>).mockReturnValue({
        sort: sortMock,
      });

      const result = await service.getTransactionsByType(orgId, 'generation');

      expect(result).toBe(mockTransactions);
      expect(mockModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          organization: new string(orgId),
          type: 'generation',
        }),
      );
    });

    it('should use default limit of 100', async () => {
      const orgId = '507f1f77bcf86cd799439011';
      const execMock = vi.fn().mockResolvedValue([]);
      const limitMock = vi.fn().mockReturnValue({ exec: execMock });
      const sortMock = vi.fn().mockReturnValue({ limit: limitMock });
      (mockModel.find as ReturnType<typeof vi.fn>).mockReturnValue({
        sort: sortMock,
      });

      await service.getTransactionsByType(orgId, 'generation');

      expect(limitMock).toHaveBeenCalledWith(100);
    });

    it('should accept custom limit', async () => {
      const orgId = '507f1f77bcf86cd799439011';
      const execMock = vi.fn().mockResolvedValue([]);
      const limitMock = vi.fn().mockReturnValue({ exec: execMock });
      const sortMock = vi.fn().mockReturnValue({ limit: limitMock });
      (mockModel.find as ReturnType<typeof vi.fn>).mockReturnValue({
        sort: sortMock,
      });

      await service.getTransactionsByType(orgId, 'generation', 25);

      expect(limitMock).toHaveBeenCalledWith(25);
    });
  });

  describe('delete', () => {
    it('should soft delete a transaction', async () => {
      const id = '507f1f77bcf86cd799439011';
      (
        mockModel.findByIdAndUpdate as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        isDeleted: true,
      });

      await service.delete(id);

      expect(mockModel.findByIdAndUpdate).toHaveBeenCalledWith(id, {
        isDeleted: true,
      });
    });
  });

  describe('getUsageMetrics', () => {
    it('should return complete usage metrics', async () => {
      const orgId = '507f1f77bcf86cd799439011';

      mockCreditBalanceService.getOrCreateBalance.mockResolvedValue({
        balance: 1000,
      });

      (mockModel.aggregate as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([{ usage7Days: 70, usage30Days: 300 }])
        .mockResolvedValueOnce([
          { _id: 'generation', amount: 200, count: 20 },
          { _id: 'publishing', amount: 100, count: 10 },
        ]);

      const result = await service.getUsageMetrics(orgId);

      expect(result.currentBalance).toBe(1000);
      expect(result.usage7Days).toBe(70);
      expect(result.usage30Days).toBe(300);
      expect(result.breakdown).toHaveLength(2);
      expect(typeof result.trendPercentage).toBe('number');
    });

    it('should handle zero usage', async () => {
      const orgId = '507f1f77bcf86cd799439011';

      mockCreditBalanceService.getOrCreateBalance.mockResolvedValue({
        balance: 500,
      });

      (mockModel.aggregate as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await service.getUsageMetrics(orgId);

      expect(result.currentBalance).toBe(500);
      expect(result.usage7Days).toBe(0);
      expect(result.usage30Days).toBe(0);
      expect(result.trendPercentage).toBe(0);
      expect(result.breakdown).toEqual([]);
    });

    it('should handle null balance', async () => {
      const orgId = '507f1f77bcf86cd799439011';

      mockCreditBalanceService.getOrCreateBalance.mockResolvedValue({
        balance: null,
      });

      (mockModel.aggregate as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const result = await service.getUsageMetrics(orgId);

      expect(result.currentBalance).toBe(0);
    });

    it('should throw and log on error', async () => {
      const orgId = '507f1f77bcf86cd799439011';
      const error = new Error('aggregation failed');

      mockCreditBalanceService.getOrCreateBalance.mockRejectedValue(error);

      await expect(service.getUsageMetrics(orgId)).rejects.toThrow(
        'aggregation failed',
      );
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('getLastPurchaseBaseline', () => {
    it('should return zeros when there is no purchase transaction', async () => {
      const orgId = '507f1f77bcf86cd799439011';

      mockCreditBalanceService.getOrCreateBalance.mockResolvedValue({
        balance: 500,
      });

      const execMock = vi.fn().mockResolvedValue(null);
      const sortMock = vi.fn().mockReturnValue({ exec: execMock });
      (mockModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
        sort: sortMock,
      });

      const result = await service.getLastPurchaseBaseline(orgId);

      expect(result.currentBalance).toBe(500);
      expect(result.lastPurchaseCredits).toBe(0);
      expect(result.usedSinceLastPurchase).toBe(0);
      expect(result.usedPercent).toBe(0);
      expect(result.lastPurchaseAt).toBeNull();
    });

    it('should compute used percentage from latest purchase', async () => {
      const orgId = '507f1f77bcf86cd799439011';
      const purchaseDate = new Date('2026-03-01T00:00:00.000Z');

      mockCreditBalanceService.getOrCreateBalance.mockResolvedValue({
        balance: 750,
      });

      const execMock = vi.fn().mockResolvedValue({
        amount: 1000,
        createdAt: purchaseDate,
      });
      const sortMock = vi.fn().mockReturnValue({ exec: execMock });
      (mockModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
        sort: sortMock,
      });

      const result = await service.getLastPurchaseBaseline(orgId);

      expect(result.lastPurchaseCredits).toBe(1000);
      expect(result.currentBalance).toBe(750);
      expect(result.usedSinceLastPurchase).toBe(250);
      expect(result.usedPercent).toBe(25);
      expect(result.lastPurchaseAt).toEqual(purchaseDate);
    });

    it('should clamp usedSinceLastPurchase to zero when balance exceeds purchase amount', async () => {
      const orgId = '507f1f77bcf86cd799439011';

      mockCreditBalanceService.getOrCreateBalance.mockResolvedValue({
        balance: 1200,
      });

      const execMock = vi.fn().mockResolvedValue({
        amount: 1000,
        createdAt: new Date('2026-03-01T00:00:00.000Z'),
      });
      const sortMock = vi.fn().mockReturnValue({ exec: execMock });
      (mockModel.findOne as ReturnType<typeof vi.fn>).mockReturnValue({
        sort: sortMock,
      });

      const result = await service.getLastPurchaseBaseline(orgId);

      expect(result.usedSinceLastPurchase).toBe(0);
      expect(result.usedPercent).toBe(0);
    });
  });
});
