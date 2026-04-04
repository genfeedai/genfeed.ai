import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { CreditBalanceService } from '@api/collections/credits/services/credit-balance.service';
import { CreditTransactionsService } from '@api/collections/credits/services/credit-transactions.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { SubscriptionsService } from '@api/collections/subscriptions/services/subscriptions.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import { BusinessLogicException } from '@api/helpers/exceptions/business/business-logic.exception';
import { TransactionUtil } from '@api/helpers/utils/transaction/transaction.util';
import { ClerkService } from '@api/services/integrations/clerk/clerk.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { ActivitySource, CreditTransactionCategory } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { Types } from 'mongoose';

describe('CreditsUtilsService', () => {
  let service: CreditsUtilsService;

  const mockLogger: Record<string, ReturnType<typeof vi.fn>> = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  const mockActivitiesService = {
    create: vi.fn().mockResolvedValue({}),
  };

  const mockBrandsService = {
    findOne: vi.fn().mockResolvedValue({ _id: new Types.ObjectId() }),
  };

  const mockCreditBalanceService = {
    findByOrganization: vi.fn(),
    getOrCreateBalance: vi.fn(),
    updateBalance: vi.fn().mockResolvedValue({}),
  };

  const mockCreditTransactionsService = {
    createTransactionEntry: vi.fn().mockResolvedValue({}),
    getLatestTransactionBeforeDate: vi.fn().mockResolvedValue(null),
    getOrganizationTransactions: vi.fn().mockResolvedValue([]),
    getOrganizationTransactionsInRange: vi.fn().mockResolvedValue([]),
  };

  const mockOrganizationsService = {
    findOne: vi.fn(),
  };

  const mockOrganizationSettingsService = {
    findOne: vi.fn().mockResolvedValue(null),
    patch: vi.fn().mockResolvedValue({}),
  };

  const mockSubscriptionsService = {
    findByOrganizationId: vi.fn().mockResolvedValue(null),
  };

  const mockUsersService = {
    findOne: vi.fn().mockResolvedValue(null),
  };

  const mockClerkService = {
    updateUserPublicMetadata: vi.fn().mockResolvedValue({}),
  };

  const mockWebsocketService = {
    emit: vi.fn().mockResolvedValue(undefined),
  };

  const mockAccessBootstrapCacheService = {
    invalidateForOrganization: vi.fn().mockResolvedValue(undefined),
    invalidateForUser: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    service = new CreditsUtilsService(
      mockLogger as unknown as LoggerService,
      mockActivitiesService as unknown as ActivitiesService,
      mockBrandsService as unknown as BrandsService,
      mockCreditBalanceService as unknown as CreditBalanceService,
      mockCreditTransactionsService as unknown as CreditTransactionsService,
      mockOrganizationSettingsService as unknown as OrganizationSettingsService,
      mockOrganizationsService as unknown as OrganizationsService,
      mockSubscriptionsService as unknown as SubscriptionsService,
      mockUsersService as unknown as UsersService,
      mockClerkService as unknown as ClerkService,
      mockWebsocketService as unknown as NotificationsPublisherService,
      mockAccessBootstrapCacheService as unknown as AccessBootstrapCacheService,
      undefined as unknown as TransactionUtil,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('deductCreditsFromOrganization', () => {
    const orgId = '507f1f77bcf86cd799439011';
    const userId = '507f1f77bcf86cd799439012';

    beforeEach(() => {
      mockOrganizationsService.findOne.mockResolvedValue({
        _id: new Types.ObjectId(orgId),
        label: 'Test Org',
      });
    });

    it('should deduct credits successfully', async () => {
      mockCreditBalanceService.findByOrganization.mockResolvedValue({
        balance: 100,
      });

      await service.deductCreditsFromOrganization(
        orgId,
        userId,
        10,
        'Test deduction',
      );

      expect(mockCreditBalanceService.updateBalance).toHaveBeenCalledWith(
        orgId,
        90,
      );
      expect(
        mockCreditTransactionsService.createTransactionEntry,
      ).toHaveBeenCalledWith(
        orgId,
        CreditTransactionCategory.DEDUCT,
        10,
        100,
        90,
        ActivitySource.SCRIPT,
        'Test deduction',
      );
    });

    it('should throw when organization not found', async () => {
      mockOrganizationsService.findOne.mockResolvedValue(null);

      await expect(
        service.deductCreditsFromOrganization(orgId, userId, 10, 'desc'),
      ).rejects.toThrow(BusinessLogicException);
    });

    it('should throw when insufficient credits', async () => {
      mockCreditBalanceService.findByOrganization.mockResolvedValue({
        balance: 5,
      });

      await expect(
        service.deductCreditsFromOrganization(orgId, userId, 10, 'desc'),
      ).rejects.toThrow(BusinessLogicException);
    });

    it('should allow a bounded overdraft when configured', async () => {
      mockCreditBalanceService.findByOrganization.mockResolvedValue({
        balance: 3,
      });

      await service.deductCreditsFromOrganization(
        orgId,
        userId,
        7,
        'Deferred text settlement',
        ActivitySource.SCRIPT,
        { maxOverdraftCredits: 5 },
      );

      expect(mockCreditBalanceService.updateBalance).toHaveBeenCalledWith(
        orgId,
        -4,
      );
      expect(
        mockCreditTransactionsService.createTransactionEntry,
      ).toHaveBeenCalledWith(
        orgId,
        CreditTransactionCategory.DEDUCT,
        7,
        3,
        -4,
        ActivitySource.SCRIPT,
        'Deferred text settlement',
      );
    });

    it('should reject overdraft beyond configured cap', async () => {
      mockCreditBalanceService.findByOrganization.mockResolvedValue({
        balance: 3,
      });

      await expect(
        service.deductCreditsFromOrganization(
          orgId,
          userId,
          10,
          'Deferred text settlement',
          ActivitySource.SCRIPT,
          { maxOverdraftCredits: 5 },
        ),
      ).rejects.toThrow(BusinessLogicException);
    });

    it('should emit websocket event after deduction', async () => {
      mockCreditBalanceService.findByOrganization.mockResolvedValue({
        balance: 100,
      });

      await service.deductCreditsFromOrganization(orgId, userId, 10, 'desc');

      expect(mockWebsocketService.emit).toHaveBeenCalledWith(
        `/credits/${orgId}`,
        { balance: 90 },
      );
    });

    it('should update clerk metadata when user has clerkId', async () => {
      mockCreditBalanceService.findByOrganization.mockResolvedValue({
        balance: 100,
      });
      mockUsersService.findOne.mockResolvedValue({
        _id: new Types.ObjectId(userId),
        clerkId: 'clerk_abc',
      });

      await service.deductCreditsFromOrganization(orgId, userId, 10, 'desc');

      expect(mockClerkService.updateUserPublicMetadata).toHaveBeenCalledWith(
        'clerk_abc',
        { balance: 90 },
      );
    });

    it('should not update clerk when user has no clerkId', async () => {
      mockCreditBalanceService.findByOrganization.mockResolvedValue({
        balance: 100,
      });
      mockUsersService.findOne.mockResolvedValue({
        _id: new Types.ObjectId(userId),
        clerkId: null,
      });

      await service.deductCreditsFromOrganization(orgId, userId, 10, 'desc');

      expect(mockClerkService.updateUserPublicMetadata).not.toHaveBeenCalled();
    });

    it('should create activity log after deduction', async () => {
      mockCreditBalanceService.findByOrganization.mockResolvedValue({
        balance: 100,
      });
      const defaultBrand = { _id: new Types.ObjectId() };
      mockBrandsService.findOne.mockResolvedValue(defaultBrand);

      await service.deductCreditsFromOrganization(orgId, userId, 10, 'desc');

      expect(mockActivitiesService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          brand: defaultBrand._id,
          value: '10',
        }),
      );
    });

    it('should accept custom ActivitySource', async () => {
      mockCreditBalanceService.findByOrganization.mockResolvedValue({
        balance: 100,
      });

      await service.deductCreditsFromOrganization(
        orgId,
        userId,
        10,
        'desc',
        ActivitySource.SUPERADMIN,
      );

      expect(
        mockCreditTransactionsService.createTransactionEntry,
      ).toHaveBeenCalledWith(
        orgId,
        CreditTransactionCategory.DEDUCT,
        10,
        100,
        90,
        ActivitySource.SUPERADMIN,
        'desc',
      );
    });

    it('should deduct exact amount from balance', async () => {
      mockCreditBalanceService.findByOrganization.mockResolvedValue({
        balance: 50,
      });

      await service.deductCreditsFromOrganization(orgId, userId, 50, 'desc');

      expect(mockCreditBalanceService.updateBalance).toHaveBeenCalledWith(
        orgId,
        0,
      );
    });
  });

  describe('checkOrganizationCreditsAvailable', () => {
    it('should return true when sufficient credits', async () => {
      mockCreditBalanceService.findByOrganization.mockResolvedValue({
        balance: 100,
      });

      const result = await service.checkOrganizationCreditsAvailable(
        '507f1f77bcf86cd799439011',
        50,
      );

      expect(result).toBe(true);
    });

    it('should return false when insufficient credits', async () => {
      mockCreditBalanceService.findByOrganization.mockResolvedValue({
        balance: 10,
      });

      const result = await service.checkOrganizationCreditsAvailable(
        '507f1f77bcf86cd799439011',
        50,
      );

      expect(result).toBe(false);
    });

    it('should return true when exact credits available', async () => {
      mockCreditBalanceService.findByOrganization.mockResolvedValue({
        balance: 50,
      });

      const result = await service.checkOrganizationCreditsAvailable(
        '507f1f77bcf86cd799439011',
        50,
      );

      expect(result).toBe(true);
    });

    it('should handle zero balance', async () => {
      mockCreditBalanceService.findByOrganization.mockResolvedValue(null);

      const result = await service.checkOrganizationCreditsAvailable(
        '507f1f77bcf86cd799439011',
        1,
      );

      expect(result).toBe(false);
    });
  });

  describe('getOrganizationCreditsBalance', () => {
    it('should return balance when exists', async () => {
      mockCreditBalanceService.findByOrganization.mockResolvedValue({
        balance: 500,
      });

      const result = await service.getOrganizationCreditsBalance(
        '507f1f77bcf86cd799439011',
      );

      expect(result).toBe(500);
    });

    it('should return 0 when no balance exists', async () => {
      mockCreditBalanceService.findByOrganization.mockResolvedValue(null);

      const result = await service.getOrganizationCreditsBalance(
        '507f1f77bcf86cd799439011',
      );

      expect(result).toBe(0);
    });
  });

  describe('addOrganizationCreditsWithExpiration', () => {
    const orgId = '507f1f77bcf86cd799439011';
    const expiresAt = new Date('2027-01-01');

    beforeEach(() => {
      mockOrganizationsService.findOne.mockResolvedValue({
        _id: new Types.ObjectId(orgId),
      });
      mockCreditBalanceService.findByOrganization.mockResolvedValue({
        balance: 100,
      });
    });

    it('should add credits with expiration', async () => {
      await service.addOrganizationCreditsWithExpiration(
        orgId,
        500,
        'subscription',
        'Monthly credits',
        expiresAt,
      );

      expect(mockCreditBalanceService.updateBalance).toHaveBeenCalledWith(
        orgId,
        600,
      );
      expect(
        mockCreditTransactionsService.createTransactionEntry,
      ).toHaveBeenCalledWith(
        orgId,
        CreditTransactionCategory.ADD,
        500,
        100,
        600,
        'subscription',
        'Monthly credits',
        expiresAt,
      );
    });

    it('should throw when organization not found', async () => {
      mockOrganizationsService.findOne.mockResolvedValue(null);

      await expect(
        service.addOrganizationCreditsWithExpiration(
          orgId,
          500,
          'src',
          'desc',
          expiresAt,
        ),
      ).rejects.toThrow(BusinessLogicException);
    });

    it('should emit websocket event after adding credits', async () => {
      await service.addOrganizationCreditsWithExpiration(
        orgId,
        500,
        'src',
        'desc',
        expiresAt,
      );

      expect(mockWebsocketService.emit).toHaveBeenCalledWith(
        `/credits/${orgId}`,
        { balance: 600 },
      );
    });
  });

  describe('refundOrganizationCredits', () => {
    const orgId = '507f1f77bcf86cd799439011';
    const expiresAt = new Date('2027-01-01');

    beforeEach(() => {
      mockOrganizationsService.findOne.mockResolvedValue({
        _id: new Types.ObjectId(orgId),
      });
      mockCreditBalanceService.findByOrganization.mockResolvedValue({
        balance: 100,
      });
    });

    it('should refund credits', async () => {
      await service.refundOrganizationCredits(
        orgId,
        50,
        'manual',
        'User refund',
        expiresAt,
      );

      expect(mockCreditBalanceService.updateBalance).toHaveBeenCalledWith(
        orgId,
        150,
      );
      expect(
        mockCreditTransactionsService.createTransactionEntry,
      ).toHaveBeenCalledWith(
        orgId,
        CreditTransactionCategory.REFUND,
        50,
        100,
        150,
        'manual',
        'User refund',
        expiresAt,
      );
    });

    it('should throw when org not found for refund', async () => {
      mockOrganizationsService.findOne.mockResolvedValue(null);

      await expect(
        service.refundOrganizationCredits(orgId, 50, 'src', 'desc', expiresAt),
      ).rejects.toThrow(BusinessLogicException);
    });
  });

  describe('resetOrganizationCredits', () => {
    const orgId = '507f1f77bcf86cd799439011';

    beforeEach(() => {
      mockOrganizationsService.findOne.mockResolvedValue({
        _id: new Types.ObjectId(orgId),
      });
      mockCreditBalanceService.findByOrganization.mockResolvedValue({
        balance: 100,
      });
    });

    it('should reset credits to specified amount', async () => {
      await service.resetOrganizationCredits(orgId, 1000, 'admin', 'Reset');

      expect(mockCreditBalanceService.updateBalance).toHaveBeenCalledWith(
        orgId,
        1000,
      );
      expect(
        mockCreditTransactionsService.createTransactionEntry,
      ).toHaveBeenCalledWith(
        orgId,
        CreditTransactionCategory.RESET,
        1000,
        100,
        1000,
        'admin',
        'Reset',
      );
    });
  });

  describe('removeAllOrganizationCredits', () => {
    const orgId = '507f1f77bcf86cd799439011';

    beforeEach(() => {
      mockOrganizationsService.findOne.mockResolvedValue({
        _id: new Types.ObjectId(orgId),
      });
      mockCreditBalanceService.findByOrganization.mockResolvedValue({
        balance: 500,
      });
    });

    it('should remove all credits', async () => {
      await service.removeAllOrganizationCredits(orgId, 'admin', 'Cleanup');

      expect(mockCreditBalanceService.updateBalance).toHaveBeenCalledWith(
        orgId,
        0,
      );
      expect(mockWebsocketService.emit).toHaveBeenCalledWith(
        `/credits/${orgId}`,
        { balance: 0 },
      );
    });

    it('should throw when org not found', async () => {
      mockOrganizationsService.findOne.mockResolvedValue(null);

      await expect(
        service.removeAllOrganizationCredits(orgId, 'src', 'desc'),
      ).rejects.toThrow(BusinessLogicException);
    });
  });

  describe('getOrganizationCreditsWithExpiration', () => {
    it('should return credits with transaction history', async () => {
      const orgId = '507f1f77bcf86cd799439011';
      mockCreditBalanceService.findByOrganization.mockResolvedValue({
        balance: 500,
      });
      mockCreditTransactionsService.getOrganizationTransactions.mockResolvedValue(
        [
          {
            amount: 100,
            createdAt: new Date(),
            expiresAt: new Date('2027-01-01'),
            source: 'subscription',
          },
        ],
      );

      const result = await service.getOrganizationCreditsWithExpiration(orgId);

      expect(result.total).toBe(500);
      expect(result.credits).toHaveLength(1);
      expect(result.credits[0].source).toBe('subscription');
    });
  });

  describe('getCycleRemainingMetrics', () => {
    const orgId = '507f1f77bcf86cd799439011';
    const cycleStartAt = new Date('2026-03-01T00:00:00.000Z');
    const cycleEndAt = new Date('2026-03-31T23:59:59.999Z');

    it('should compute percentage using pre-cycle balance and in-cycle inflows', async () => {
      mockCreditTransactionsService.getLatestTransactionBeforeDate.mockResolvedValue(
        { balanceAfter: 200 },
      );
      mockCreditTransactionsService.getOrganizationTransactionsInRange.mockResolvedValue(
        [
          { amount: 100, category: CreditTransactionCategory.ADD },
          { amount: 50, category: CreditTransactionCategory.REFUND },
          { amount: 30, category: CreditTransactionCategory.DEDUCT },
        ],
      );

      const result = await service.getCycleRemainingMetrics(
        orgId,
        cycleStartAt,
        cycleEndAt,
        210,
      );

      expect(result.cycleTotal).toBe(350);
      expect(result.remainingPercent).toBe(60);
    });

    it('should use latest reset as baseline when reset exists in cycle', async () => {
      mockCreditTransactionsService.getLatestTransactionBeforeDate.mockResolvedValue(
        { balanceAfter: 500 },
      );
      mockCreditTransactionsService.getOrganizationTransactionsInRange.mockResolvedValue(
        [
          {
            amount: 100,
            balanceAfter: 600,
            category: CreditTransactionCategory.ADD,
          },
          {
            amount: 300,
            balanceAfter: 300,
            category: CreditTransactionCategory.RESET,
          },
          {
            amount: 200,
            balanceAfter: 500,
            category: CreditTransactionCategory.ADD,
          },
        ],
      );

      const result = await service.getCycleRemainingMetrics(
        orgId,
        cycleStartAt,
        cycleEndAt,
        250,
      );

      expect(result.cycleTotal).toBe(500);
      expect(result.remainingPercent).toBe(50);
    });

    it('should return 0 percent when cycle total is zero', async () => {
      mockCreditTransactionsService.getLatestTransactionBeforeDate.mockResolvedValue(
        null,
      );
      mockCreditTransactionsService.getOrganizationTransactionsInRange.mockResolvedValue(
        [],
      );

      const result = await service.getCycleRemainingMetrics(
        orgId,
        cycleStartAt,
        cycleEndAt,
        0,
      );

      expect(result.cycleTotal).toBe(0);
      expect(result.remainingPercent).toBe(0);
    });
  });
});
