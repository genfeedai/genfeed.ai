import { CreditBalanceService } from '@api/collections/credits/services/credit-balance.service';
import { CreditTransactionsService } from '@api/collections/credits/services/credit-transactions.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import { BusinessLogicException } from '@api/helpers/exceptions/business/business-logic.exception';
import type { PrismaTransactionClient } from '@api/helpers/utils/transaction/transaction.util';
import { TransactionUtil } from '@api/helpers/utils/transaction/transaction.util';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { EventBusService } from '@api/shared/services/event-bus/event-bus.service';
import { LoggerService } from '@libs/logger/logger.service';

describe('CreditsUtilsService', () => {
  const loggerService = { error: vi.fn(), log: vi.fn() };
  const eventBusService = { emit: vi.fn() };
  const prisma = {
    brand: { findFirst: vi.fn() },
    organization: { findFirst: vi.fn() },
    subscription: { findFirst: vi.fn() },
    user: { findFirst: vi.fn() },
  };
  const creditBalanceService = {
    findByOrganization: vi.fn(),
    updateBalance: vi.fn(),
  };
  const creditTransactionsService = {
    createTransactionEntry: vi.fn(),
  };
  const organizationSettingsService = {
    findOne: vi.fn(),
    patch: vi.fn(),
  };
  const websocketService = { emit: vi.fn() };
  const accessBootstrapCacheService = { invalidateForOrganization: vi.fn() };

  // Marker object standing in for the Prisma transaction client that
  // runInTransaction injects — assertions check it is threaded through.
  const txClient = { __tx: true } as unknown as PrismaTransactionClient;
  const transactionUtil = {
    runInTransaction: vi.fn(
      async (fn: (tx: PrismaTransactionClient) => Promise<unknown>) =>
        fn(txClient),
    ),
  };

  function buildService(withTransactionUtil = true): CreditsUtilsService {
    return new CreditsUtilsService(
      loggerService as unknown as LoggerService,
      eventBusService as unknown as EventBusService,
      prisma as unknown as PrismaService,
      creditBalanceService as unknown as CreditBalanceService,
      creditTransactionsService as unknown as CreditTransactionsService,
      organizationSettingsService as unknown as OrganizationSettingsService,
      websocketService as unknown as NotificationsPublisherService,
      accessBootstrapCacheService as unknown as AccessBootstrapCacheService,
      withTransactionUtil
        ? (transactionUtil as unknown as TransactionUtil)
        : undefined,
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.organization.findFirst.mockResolvedValue({ id: 'org_1' });
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.brand.findFirst.mockResolvedValue(null);
    prisma.subscription.findFirst.mockResolvedValue(null);
    creditBalanceService.findByOrganization.mockResolvedValue({ balance: 100 });
    creditBalanceService.updateBalance.mockResolvedValue({ balance: 60 });
    creditTransactionsService.createTransactionEntry.mockResolvedValue({});
    organizationSettingsService.findOne.mockResolvedValue(null);
  });

  describe('deductCreditsFromOrganization', () => {
    it('runs balance read + write + ledger entry on the transaction client', async () => {
      const service = buildService();

      await service.deductCreditsFromOrganization(
        'org_1',
        'user_1',
        40,
        'test deduct',
      );

      expect(transactionUtil.runInTransaction).toHaveBeenCalledTimes(1);
      // Serializable isolation is what actually prevents concurrent double-spend
      expect(transactionUtil.runInTransaction).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({ isolationLevel: 'Serializable' }),
      );
      expect(creditBalanceService.findByOrganization).toHaveBeenCalledWith(
        'org_1',
        txClient,
      );
      expect(creditBalanceService.updateBalance).toHaveBeenCalledWith(
        'org_1',
        60,
        txClient,
      );
      expect(
        creditTransactionsService.createTransactionEntry,
      ).toHaveBeenCalledWith(
        'org_1',
        expect.anything(),
        40,
        100,
        60,
        expect.anything(),
        'test deduct',
        undefined,
        txClient,
      );
    });

    it('throws on insufficient credits without writing', async () => {
      const service = buildService();

      await expect(
        service.deductCreditsFromOrganization(
          'org_1',
          'user_1',
          150,
          'too much',
        ),
      ).rejects.toThrow(BusinessLogicException);

      expect(creditBalanceService.updateBalance).not.toHaveBeenCalled();
      expect(
        creditTransactionsService.createTransactionEntry,
      ).not.toHaveBeenCalled();
    });

    it('falls back to non-transactional path when TransactionUtil is absent', async () => {
      const service = buildService(false);

      await service.deductCreditsFromOrganization(
        'org_1',
        'user_1',
        40,
        'fallback deduct',
      );

      expect(transactionUtil.runInTransaction).not.toHaveBeenCalled();
      expect(creditBalanceService.updateBalance).toHaveBeenCalledWith(
        'org_1',
        60,
        undefined,
      );
    });
  });

  describe('addOrganizationCreditsWithExpiration', () => {
    it('threads the transaction client through balance write and ledger entry', async () => {
      const service = buildService();
      const expiresAt = new Date('2027-01-01T00:00:00Z');

      await service.addOrganizationCreditsWithExpiration(
        'org_1',
        50,
        'stripe',
        'renewal credits',
        expiresAt,
      );

      expect(transactionUtil.runInTransaction).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({ isolationLevel: 'Serializable' }),
      );
      expect(creditBalanceService.updateBalance).toHaveBeenCalledWith(
        'org_1',
        150,
        txClient,
      );
      expect(
        creditTransactionsService.createTransactionEntry,
      ).toHaveBeenCalledWith(
        'org_1',
        expect.anything(),
        50,
        100,
        150,
        'stripe',
        'renewal credits',
        expiresAt,
        txClient,
      );
    });
  });

  describe('refundOrganizationCredits', () => {
    it('threads the transaction client', async () => {
      const service = buildService();

      await service.refundOrganizationCredits(
        'org_1',
        10,
        'system',
        'refund',
        new Date('2027-01-01T00:00:00Z'),
      );

      expect(creditBalanceService.updateBalance).toHaveBeenCalledWith(
        'org_1',
        110,
        txClient,
      );
    });
  });

  describe('resetOrganizationCredits', () => {
    it('threads the transaction client', async () => {
      const service = buildService();

      await service.resetOrganizationCredits('org_1', 500, 'system', 'reset');

      expect(creditBalanceService.updateBalance).toHaveBeenCalledWith(
        'org_1',
        500,
        txClient,
      );
    });
  });

  describe('removeAllOrganizationCredits', () => {
    it('threads the transaction client', async () => {
      const service = buildService();

      await service.removeAllOrganizationCredits('org_1', 'system', 'wipe');

      expect(creditBalanceService.updateBalance).toHaveBeenCalledWith(
        'org_1',
        0,
        txClient,
      );
    });
  });
});
