import { BillingAccountsService } from '@api/collections/billing-accounts/services/billing-accounts.service';
import { CreditBalanceService } from '@api/collections/credits/services/credit-balance.service';
import { CreditReservationService } from '@api/collections/credits/services/credit-reservation.service';
import { CreditTransactionsService } from '@api/collections/credits/services/credit-transactions.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import type { PrismaTransactionClient } from '@api/helpers/utils/transaction/transaction.util';
import { TransactionUtil } from '@api/helpers/utils/transaction/transaction.util';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import type { EventEmitter2 } from '@nestjs/event-emitter';

describe('CreditsUtilsService', () => {
  const loggerService = { error: vi.fn(), log: vi.fn() };
  const eventEmitter = { emit: vi.fn() };
  const prisma = {
    brand: { findFirst: vi.fn() },
    creditTransaction: { findFirst: vi.fn() },
    organization: { findFirst: vi.fn() },
    subscription: { findFirst: vi.fn() },
    user: { findFirst: vi.fn() },
  };
  const billingAccountsService = {
    resolveForOrganization: vi.fn(),
  };
  const creditReservationService = {
    release: vi.fn(),
    reserve: vi.fn(),
    settle: vi.fn(),
  };
  const creditBalanceService = {
    applyDelta: vi.fn(),
    findByOrganization: vi.fn(),
    getOrCreateBalance: vi.fn(),
    toSnapshot: vi.fn(),
    updateBalance: vi.fn(),
  };
  const creditTransactionsService = {
    createTransactionEntry: vi.fn(),
    findOne: vi.fn(),
  };
  const organizationSettingsService = {
    findOne: vi.fn(),
    patch: vi.fn(),
  };
  const websocketService = { emit: vi.fn() };
  const accessBootstrapCacheService = { invalidateForOrganization: vi.fn() };

  const txCreditTransactionFindFirst = vi.fn();
  const txClient = {
    creditTransaction: { findFirst: txCreditTransactionFindFirst },
  } as unknown as PrismaTransactionClient;
  const transactionUtil = {
    runInTransaction: vi.fn(
      async (fn: (tx: PrismaTransactionClient) => Promise<unknown>) =>
        fn(txClient),
    ),
  };

  function buildService(): CreditsUtilsService {
    return new CreditsUtilsService(
      loggerService as unknown as LoggerService,
      eventEmitter as unknown as EventEmitter2,
      prisma as unknown as PrismaService,
      billingAccountsService as unknown as BillingAccountsService,
      creditBalanceService as unknown as CreditBalanceService,
      creditReservationService as unknown as CreditReservationService,
      creditTransactionsService as unknown as CreditTransactionsService,
      organizationSettingsService as unknown as OrganizationSettingsService,
      websocketService as unknown as NotificationsPublisherService,
      accessBootstrapCacheService as unknown as AccessBootstrapCacheService,
      transactionUtil as unknown as TransactionUtil,
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.organization.findFirst.mockResolvedValue({ id: 'org_1' });
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.brand.findFirst.mockResolvedValue(null);
    prisma.subscription.findFirst.mockResolvedValue(null);
    prisma.creditTransaction.findFirst.mockResolvedValue(null);
    txCreditTransactionFindFirst.mockResolvedValue(null);
    billingAccountsService.resolveForOrganization.mockResolvedValue({
      id: 'ba_1',
    });
    creditBalanceService.findByOrganization.mockResolvedValue({
      balance: 100,
      heldAmount: 0,
    });
    creditBalanceService.getOrCreateBalance.mockResolvedValue({
      balance: 100,
      billingAccountId: 'ba_1',
      heldAmount: 0,
      id: 'bal_1',
      organizationId: 'org_1',
      version: 1,
    });
    creditBalanceService.toSnapshot.mockImplementation(
      (row: {
        balance: number;
        billingAccountId?: string;
        heldAmount?: number;
        id: string;
        organizationId: string;
        version?: number;
      }) => ({
        available: row.balance - (row.heldAmount ?? 0),
        billingAccountId: row.billingAccountId ?? null,
        held: row.heldAmount ?? 0,
        id: row.id,
        organizationId: row.organizationId,
        settled: row.balance,
        version: row.version ?? 0,
      }),
    );
    creditBalanceService.applyDelta.mockResolvedValue({
      available: 60,
      billingAccountId: 'ba_1',
      held: 0,
      id: 'bal_1',
      organizationId: 'org_1',
      settled: 60,
      version: 2,
    });
    creditBalanceService.updateBalance.mockResolvedValue({ balance: 60 });
    creditTransactionsService.createTransactionEntry.mockResolvedValue({});
    creditTransactionsService.findOne.mockResolvedValue(null);
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
      expect(creditBalanceService.applyDelta).toHaveBeenCalledWith(
        'org_1',
        {
          balanceDelta: -40,
          billingAccountId: 'ba_1',
          maxOverdraftCredits: 0,
        },
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
        expect.objectContaining({
          actorUserId: 'user_1',
          billingAccountId: 'ba_1',
        }),
      );
    });

    it('throws on insufficient credits without writing', async () => {
      const service = buildService();
      creditBalanceService.applyDelta.mockRejectedValue(
        new BusinessLogicException('Insufficient organization credits'),
      );

      await expect(
        service.deductCreditsFromOrganization(
          'org_1',
          'user_1',
          150,
          'too much',
        ),
      ).rejects.toThrow(BusinessLogicException);

      expect(
        creditTransactionsService.createTransactionEntry,
      ).not.toHaveBeenCalled();
    });

    it('skips an idempotent deduction when the ledger reference already exists', async () => {
      const service = buildService();
      txCreditTransactionFindFirst.mockResolvedValue({
        id: 'txn_existing',
      });

      await service.deductCreditsFromOrganization(
        'org_1',
        'user_1',
        40,
        'Fleet voice clone compute',
        undefined,
        {
          referenceId: 'fleet-job-1',
          referenceType: 'fleet:voice-clone',
        },
      );

      expect(txCreditTransactionFindFirst).toHaveBeenCalledWith({
        where: {
          category: expect.anything(),
          isDeleted: false,
          organizationId: 'org_1',
          referenceId: 'fleet-job-1',
          referenceType: 'fleet:voice-clone',
        },
      });
      expect(creditBalanceService.updateBalance).not.toHaveBeenCalled();
      expect(
        creditTransactionsService.createTransactionEntry,
      ).not.toHaveBeenCalled();
    });

    it('matches the global idempotency index and skips duplicate deduction side effects', async () => {
      const service = buildService();
      txCreditTransactionFindFirst.mockResolvedValue({
        balanceAfter: 60,
        organizationId: 'org_original',
      });

      await service.deductCreditsFromOrganization(
        'org_1',
        'user_1',
        40,
        'referral reversal',
        undefined,
        { idempotencyKey: 'referral-reward-reversal:reward_1:4000' },
      );

      expect(txCreditTransactionFindFirst).toHaveBeenCalledWith({
        where: {
          idempotencyKey: 'referral-reward-reversal:reward_1:4000',
          isDeleted: false,
        },
      });
      expect(creditBalanceService.applyDelta).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalled();
      expect(websocketService.emit).not.toHaveBeenCalled();
    });

    // #4310: a reaper-driven retry of a deduction (same idempotency key)
    // replays this branch after the original attempt already committed the
    // balance/ledger write. The access-bootstrap cache must still be
    // invalidated on every replay so a stale cache can't outlive the retry —
    // only the websocket/activity emits are replay-guarded.
    it('invalidates the access-bootstrap cache on a replayed deduction without re-emitting balance events', async () => {
      const service = buildService();
      txCreditTransactionFindFirst.mockResolvedValue({
        balanceAfter: 60,
        organizationId: 'org_original',
      });

      await service.deductCreditsFromOrganization(
        'org_1',
        'user_1',
        40,
        'referral reversal',
        undefined,
        { idempotencyKey: 'referral-reward-reversal:reward_1:4000' },
      );

      expect(
        accessBootstrapCacheService.invalidateForOrganization,
      ).toHaveBeenCalledWith('org_1');
      expect(eventEmitter.emit).not.toHaveBeenCalled();
      expect(websocketService.emit).not.toHaveBeenCalled();
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
        'ba_1',
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

    it('persists a caller-provided idempotency key on the ledger entry', async () => {
      const service = buildService();

      await service.addOrganizationCreditsWithExpiration(
        'org_1',
        50,
        'credits-referral',
        'referral reward',
        new Date('2027-01-01T00:00:00Z'),
        { idempotencyKey: 'referral-reward-grant:reward_1' },
      );

      expect(txCreditTransactionFindFirst).toHaveBeenCalledWith({
        where: {
          idempotencyKey: 'referral-reward-grant:reward_1',
          isDeleted: false,
        },
      });
      expect(
        creditTransactionsService.createTransactionEntry,
      ).toHaveBeenCalledWith(
        'org_1',
        expect.anything(),
        50,
        100,
        150,
        'credits-referral',
        'referral reward',
        expect.any(Date),
        txClient,
        expect.objectContaining({
          idempotencyKey: 'referral-reward-grant:reward_1',
        }),
      );
    });

    it('preserves active holds when adding settled credits', async () => {
      const service = buildService();
      creditBalanceService.getOrCreateBalance.mockResolvedValue({
        balance: 100,
        billingAccountId: 'ba_1',
        heldAmount: 20,
        id: 'bal_1',
        organizationId: 'org_1',
        version: 1,
      });

      await service.addOrganizationCreditsWithExpiration(
        'org_1',
        50,
        'stripe',
        'renewal credits',
        new Date('2027-01-01T00:00:00Z'),
      );

      expect(creditBalanceService.updateBalance).toHaveBeenCalledWith(
        'org_1',
        150,
        'ba_1',
        txClient,
      );
      expect(
        creditTransactionsService.createTransactionEntry,
      ).toHaveBeenCalledWith(
        'org_1',
        expect.anything(),
        50,
        80,
        130,
        'stripe',
        'renewal credits',
        expect.any(Date),
        txClient,
      );
    });

    it('reuses a global idempotency row without mutating a fallback organization', async () => {
      const service = buildService();
      txCreditTransactionFindFirst.mockResolvedValue({
        balanceAfter: 150,
        organizationId: 'org_original',
      });

      await service.addOrganizationCreditsWithExpiration(
        'org_fallback',
        50,
        'credits-referral',
        'referral reward',
        new Date('2027-01-01T00:00:00Z'),
        { idempotencyKey: 'referral-reward-grant:reward_1' },
      );

      expect(txCreditTransactionFindFirst).toHaveBeenCalledWith({
        where: {
          idempotencyKey: 'referral-reward-grant:reward_1',
          isDeleted: false,
        },
      });
      expect(creditBalanceService.updateBalance).not.toHaveBeenCalled();
      expect(
        creditTransactionsService.createTransactionEntry,
      ).not.toHaveBeenCalled();
      expect(websocketService.emit).not.toHaveBeenCalled();
    });

    // #4310: a reaper-driven retry of a referral-reward grant (same
    // idempotency key) replays this branch after the original attempt
    // already committed the balance/ledger write but crashed before the
    // post-transaction side effects ran. hasEverHadCredits and the
    // access-bootstrap cache must still be brought up to date on the
    // *caller's* organizationId on every replay — only the websocket balance
    // emit is replay-guarded, since that event already fired once.
    it('writes hasEverHadCredits and invalidates the access-bootstrap cache on a replayed grant', async () => {
      const service = buildService();
      txCreditTransactionFindFirst.mockResolvedValue({
        balanceAfter: 150,
        organizationId: 'org_original',
      });
      organizationSettingsService.findOne.mockResolvedValue({
        hasEverHadCredits: false,
        id: 'settings_fallback',
      });

      await service.addOrganizationCreditsWithExpiration(
        'org_fallback',
        50,
        'credits-referral',
        'referral reward',
        new Date('2027-01-01T00:00:00Z'),
        { idempotencyKey: 'referral-reward-grant:reward_1' },
      );

      expect(organizationSettingsService.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org_fallback' }),
      );
      expect(organizationSettingsService.patch).toHaveBeenCalledWith(
        'settings_fallback',
        { hasEverHadCredits: true },
      );
      expect(
        accessBootstrapCacheService.invalidateForOrganization,
      ).toHaveBeenCalledWith('org_fallback');
      expect(websocketService.emit).not.toHaveBeenCalled();
    });
  });

  describe('refundOrganizationCredits', () => {
    it('threads the transaction client and preserves active holds', async () => {
      const service = buildService();
      creditBalanceService.getOrCreateBalance.mockResolvedValue({
        balance: 100,
        billingAccountId: 'ba_1',
        heldAmount: 20,
        id: 'bal_1',
        organizationId: 'org_1',
        version: 1,
      });

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
        'ba_1',
        txClient,
      );
      expect(
        creditTransactionsService.createTransactionEntry,
      ).toHaveBeenCalledWith(
        'org_1',
        expect.anything(),
        10,
        80,
        90,
        'system',
        'refund',
        expect.any(Date),
        txClient,
        undefined,
      );
    });
  });

  it('does not move balance or emit another event when a refund is replayed', async () => {
    const service = buildService();
    txCreditTransactionFindFirst.mockResolvedValueOnce({
      id: 'refund',
      balanceAfter: 110,
    });
    await service.refundOrganizationCredits(
      'org_1',
      10,
      'system',
      'refund',
      new Date('2027-01-01T00:00:00Z'),
      { idempotencyKey: 'batch-refund:batch:1' },
    );
    expect(txCreditTransactionFindFirst).toHaveBeenCalledWith({
      where: {
        organizationId: 'org_1',
        isDeleted: false,
        category: 'refund',
        idempotencyKey: 'batch-refund:batch:1',
      },
    });
    expect(creditBalanceService.updateBalance).not.toHaveBeenCalled();
    expect(
      creditTransactionsService.createTransactionEntry,
    ).not.toHaveBeenCalled();
    expect(websocketService.emit).not.toHaveBeenCalled();
  });

  describe('resetOrganizationCredits', () => {
    it('threads the transaction client', async () => {
      const service = buildService();

      await service.resetOrganizationCredits('org_1', 500, 'system', 'reset');

      expect(creditBalanceService.updateBalance).toHaveBeenCalledWith(
        'org_1',
        500,
        'ba_1',
        txClient,
      );
      expect(
        creditTransactionsService.createTransactionEntry,
      ).toHaveBeenCalledWith(
        'org_1',
        expect.anything(),
        500,
        100,
        500,
        'system',
        'reset',
        undefined,
        txClient,
      );
    });

    // #1398: the yearly subscription reset path relies on this reference
    // being persisted on the transaction row — otherwise
    // StripeWebhookSupportService#hasSubscriptionCreditGrant can
    // never find a match and a replayed invoice.paid double-resets credits.
    it('persists a referenceId/referenceType on the reset transaction when options are passed', async () => {
      const service = buildService();

      await service.resetOrganizationCredits(
        'org_1',
        500_000,
        'yearly',
        'yearly subscription billing period reset',
        {
          referenceId: 'stripe-invoice:in_123',
          referenceType: 'stripe-invoice:subscription-grant',
        },
      );

      expect(
        creditTransactionsService.createTransactionEntry,
      ).toHaveBeenCalledWith(
        'org_1',
        expect.anything(),
        500_000,
        100,
        500_000,
        'yearly',
        'yearly subscription billing period reset',
        undefined,
        txClient,
        {
          referenceId: 'stripe-invoice:in_123',
          referenceType: 'stripe-invoice:subscription-grant',
        },
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
        'ba_1',
        txClient,
      );
    });
  });

  it('returns the requesting organization for a shared billing wallet', async () => {
    const service = buildService();
    creditBalanceService.getOrCreateBalance.mockResolvedValueOnce({
      balance: 100,
      billingAccountId: 'ba_1',
      heldAmount: 0,
      id: 'bal_1',
      organizationId: 'org_wallet_owner',
      version: 1,
    });

    await expect(service.getWalletSnapshot('org_requesting')).resolves.toEqual(
      expect.objectContaining({ organizationId: 'org_requesting' }),
    );
  });

  it('propagates billing-account resolution failures without creating a local wallet', async () => {
    const service = buildService();
    billingAccountsService.resolveForOrganization.mockRejectedValue(
      new Error('ambiguous billing account'),
    );

    await expect(service.getWalletSnapshot('org_1')).rejects.toThrow(
      'ambiguous billing account',
    );
    expect(creditBalanceService.getOrCreateBalance).not.toHaveBeenCalled();
  });
});
