import type { CreditBalanceService } from '@api/collections/credits/services/credit-balance.service';
import type { CreditTransactionsService } from '@api/collections/credits/services/credit-transactions.service';
import { FreeTrialService } from '@api/collections/credits/services/free-trial.service';
import type { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import { FreeTrialExpiredException } from '@api/exceptions/business-logic.exception';
import type {
  PrismaTransactionClient,
  TransactionUtil,
} from '@api/helpers/utils/transaction/transaction.util';
import type { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import * as deployment from '@genfeedai/config';
import {
  ActivitySource,
  CreditTransactionCategory,
} from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const CREATED_AT = new Date('2026-10-01T09:00:00.000Z');
const TRIAL_ENDS_AT = new Date('2026-10-04T09:00:00.000Z');
const IN_WINDOW = new Date('2026-10-03T09:00:00.000Z');
const PAST_WINDOW = new Date('2026-10-04T09:00:00.001Z');

type SubjectOverrides = {
  billingAccount?: {
    creditTransactions?: unknown[];
    organizationLinks?: unknown[];
    organizations?: unknown[];
    subscriptions?: unknown[];
  } | null;
  creditTransactions?: unknown[];
  isProactiveOnboarding?: boolean;
  subscriptions?: unknown[];
  userSubscription?: {
    isDeleted: boolean;
    stripeSubscriptionId: string | null;
  };
  warmupAccounts?: unknown[];
};

function subject(overrides: SubjectOverrides = {}) {
  return {
    billingAccount:
      overrides.billingAccount === null
        ? null
        : {
            creditTransactions: [],
            organizationLinks: [],
            organizations: [],
            subscriptions: [],
            ...overrides.billingAccount,
          },
    createdAt: CREATED_AT,
    creditTransactions: overrides.creditTransactions ?? [],
    isProactiveOnboarding: overrides.isProactiveOnboarding ?? false,
    subscriptions: overrides.subscriptions ?? [],
    user: { userSubscription: overrides.userSubscription ?? null },
    warmupAccounts: overrides.warmupAccounts ?? [],
  };
}

describe('FreeTrialService', () => {
  const organizationFindFirst = vi.fn();
  const walletFindFirst = vi.fn();
  const walletFindMany = vi.fn();
  const prisma = {
    creditBalance: { findFirst: walletFindFirst, findMany: walletFindMany },
    organization: { findFirst: organizationFindFirst },
  };
  const transaction = vi.fn(
    async (operation: (tx: PrismaTransactionClient) => Promise<unknown>) =>
      operation(prisma as unknown as PrismaTransactionClient),
  );
  const applyDelta = vi.fn();
  const createTransactionEntry = vi.fn();
  const emit = vi.fn();
  const invalidateForOrganization = vi.fn();
  const logger = { log: vi.fn() };

  function buildService(): FreeTrialService {
    return new FreeTrialService(
      prisma as unknown as PrismaService,
      { runInTransaction: transaction } as unknown as TransactionUtil,
      {
        applyDelta,
        toSnapshot: (wallet: {
          balance: number;
          heldAmount: number;
          version: number;
        }) => ({
          available: wallet.balance - wallet.heldAmount,
          held: wallet.heldAmount,
          settled: wallet.balance,
          version: wallet.version,
        }),
      } as unknown as CreditBalanceService,
      { createTransactionEntry } as unknown as CreditTransactionsService,
      { emit } as unknown as NotificationsPublisherService,
      { invalidateForOrganization } as unknown as AccessBootstrapCacheService,
      logger as unknown as LoggerService,
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(deployment, 'usesMeteredCredits').mockReturnValue(true);
    vi.spyOn(deployment, 'isSelfHostedDeployment').mockReturnValue(false);
    organizationFindFirst.mockResolvedValue(subject());
    walletFindFirst.mockResolvedValue({
      balance: 60,
      billingAccountId: 'ba_1',
      heldAmount: 0,
      version: 7,
    });
    applyDelta.mockResolvedValue({ available: 0 });
  });

  afterEach(() => vi.restoreAllMocks());

  describe('getState', () => {
    it('starts the 72-hour window at organization creation', async () => {
      const service = buildService();

      await expect(service.getState('org_1', IN_WINDOW)).resolves.toEqual({
        isTrialExpired: false,
        trialEndsAt: TRIAL_ENDS_AT,
      });
      await expect(service.getState('org_1', PAST_WINDOW)).resolves.toEqual({
        isTrialExpired: true,
        trialEndsAt: TRIAL_ENDS_AT,
      });
    });

    it.each([
      ['a paid credit grant', subject({ creditTransactions: [{ id: 't' }] })],
      [
        'a paid or active subscription',
        subject({ subscriptions: [{ id: 's' }] }),
      ],
      [
        'a Stripe user subscription',
        subject({
          userSubscription: { isDeleted: false, stripeSubscriptionId: 'sub_1' },
        }),
      ],
      [
        'a paid grant on its billing account',
        subject({ billingAccount: { creditTransactions: [{ id: 't' }] } }),
      ],
      [
        'a wallet shared with another organization',
        subject({ billingAccount: { organizationLinks: [{ id: 'l' }] } }),
      ],
      ['proactive onboarding', subject({ isProactiveOnboarding: true })],
      ['a warm-up workspace', subject({ warmupAccounts: [{ id: 'w' }] })],
    ])('exempts an organization with %s', async (_label, organization) => {
      organizationFindFirst.mockResolvedValue(organization);

      await expect(
        buildService().getState('org_1', PAST_WINDOW),
      ).resolves.toEqual({ isTrialExpired: false, trialEndsAt: null });
    });

    it('treats an abandoned checkout (no Stripe subscription) as never paid', async () => {
      await buildService().getState('org_1', PAST_WINDOW);

      const select = organizationFindFirst.mock.calls[0][0].select;
      expect(select.subscriptions.where).toEqual({
        isDeleted: false,
        OR: [
          { stripeSubscriptionId: { not: null } },
          { status: { in: ['ACTIVE', 'TRIALING'] } },
        ],
      });
      expect(select.creditTransactions.where).toEqual({
        amount: { gt: 0 },
        isDeleted: false,
        OR: [
          { referenceType: { startsWith: 'stripe-' } },
          {
            source: {
              in: [ActivitySource.PAY_AS_YOU_GO, 'pay-as-you-go'],
            },
          },
        ],
      });
    });

    it('never applies without metered billing or on a self-hosted deployment', async () => {
      vi.mocked(deployment.usesMeteredCredits).mockReturnValue(false);
      await expect(
        buildService().getState('org_1', PAST_WINDOW),
      ).resolves.toEqual({ isTrialExpired: false, trialEndsAt: null });

      vi.mocked(deployment.usesMeteredCredits).mockReturnValue(true);
      vi.mocked(deployment.isSelfHostedDeployment).mockReturnValue(true);
      await expect(
        buildService().getState('org_1', PAST_WINDOW),
      ).resolves.toEqual({ isTrialExpired: false, trialEndsAt: null });
      expect(organizationFindFirst).not.toHaveBeenCalled();
    });
  });

  describe('assertTrialActive (admission)', () => {
    it('admits an organization inside its window with one cheap read', async () => {
      organizationFindFirst.mockResolvedValueOnce({ createdAt: CREATED_AT });

      await expect(
        buildService().assertTrialActive('org_1', IN_WINDOW),
      ).resolves.toBeUndefined();
      expect(organizationFindFirst).toHaveBeenCalledTimes(1);
      expect(organizationFindFirst).toHaveBeenCalledWith({
        select: { createdAt: true },
        where: { id: 'org_1', isDeleted: false },
      });
    });

    it('refuses a never-paid organization past its window before the sweep ran', async () => {
      organizationFindFirst.mockResolvedValueOnce({ createdAt: CREATED_AT });

      const refusal = buildService().assertTrialActive('org_1', PAST_WINDOW);

      await expect(refusal).rejects.toBeInstanceOf(FreeTrialExpiredException);
      await expect(
        buildService().assertTrialActive('org_1', PAST_WINDOW),
      ).rejects.toMatchObject({ errorCode: 'INSUFFICIENT_CREDITS' });
    });

    it('admits a paid organization past its window and remembers the exemption', async () => {
      organizationFindFirst
        .mockResolvedValueOnce({ createdAt: CREATED_AT })
        .mockResolvedValueOnce(subject({ subscriptions: [{ id: 's' }] }));
      const service = buildService();

      await service.assertTrialActive('org_1', PAST_WINDOW);
      await service.assertTrialActive('org_1', PAST_WINDOW);

      expect(organizationFindFirst).toHaveBeenCalledTimes(2);
    });
  });

  describe('expireTrialCredits (sweep)', () => {
    it('debits the spendable free credits through an EXPIRE ledger entry', async () => {
      const expired = await buildService().expireTrialCredits(
        'org_1',
        PAST_WINDOW,
      );

      expect(expired).toBe(60);
      expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: 'Serializable',
      });
      expect(walletFindFirst).toHaveBeenCalledWith({
        where: { isDeleted: false, organizationId: 'org_1' },
      });
      expect(applyDelta).toHaveBeenCalledWith(
        'org_1',
        { balanceDelta: -60, billingAccountId: 'ba_1' },
        prisma,
      );
      expect(createTransactionEntry).toHaveBeenCalledWith(
        'org_1',
        CreditTransactionCategory.EXPIRE,
        60,
        60,
        0,
        ActivitySource.TRIAL_EXPIRED,
        'Free trial ended: unused free credits expired',
        undefined,
        prisma,
        {
          billingAccountId: 'ba_1',
          idempotencyKey: 'free-trial-expired:org_1:7',
          metadata: { trialEndsAt: TRIAL_ENDS_AT.toISOString() },
          referenceId: 'org_1',
          referenceType: 'free-trial',
        },
      );
      expect(emit).toHaveBeenCalledWith('/credits/org_1', { balance: 0 });
      expect(invalidateForOrganization).toHaveBeenCalledWith('org_1');
    });

    it('leaves credits held by an in-flight generation for it to settle', async () => {
      walletFindFirst.mockResolvedValue({
        balance: 60,
        billingAccountId: 'ba_1',
        heldAmount: 20,
        version: 3,
      });

      await expect(
        buildService().expireTrialCredits('org_1', PAST_WINDOW),
      ).resolves.toBe(40);
      expect(applyDelta).toHaveBeenCalledWith(
        'org_1',
        { balanceDelta: -40, billingAccountId: 'ba_1' },
        prisma,
      );
    });

    it('is a no-op on a re-run once nothing is spendable', async () => {
      walletFindFirst.mockResolvedValue({
        balance: 0,
        billingAccountId: 'ba_1',
        heldAmount: 0,
        version: 8,
      });

      await expect(
        buildService().expireTrialCredits('org_1', PAST_WINDOW),
      ).resolves.toBe(0);
      expect(applyDelta).not.toHaveBeenCalled();
      expect(createTransactionEntry).not.toHaveBeenCalled();
      expect(emit).not.toHaveBeenCalled();
    });

    it.each([
      ['inside its window', subject(), IN_WINDOW],
      [
        'that paid',
        subject({ creditTransactions: [{ id: 't' }] }),
        PAST_WINDOW,
      ],
      [
        'that is subscribed',
        subject({ subscriptions: [{ id: 's' }] }),
        PAST_WINDOW,
      ],
    ])(
      'never touches an organization %s',
      async (_label, organization, now) => {
        organizationFindFirst.mockResolvedValue(organization);

        await expect(
          buildService().expireTrialCredits('org_1', now),
        ).resolves.toBe(0);
        expect(walletFindFirst).not.toHaveBeenCalled();
        expect(applyDelta).not.toHaveBeenCalled();
      },
    );

    it('retries a serialization conflict and then expires once', async () => {
      transaction.mockRejectedValueOnce({ code: 'P2034' });

      await expect(
        buildService().expireTrialCredits('org_1', PAST_WINDOW),
      ).resolves.toBe(60);
      expect(transaction).toHaveBeenCalledTimes(2);
      expect(createTransactionEntry).toHaveBeenCalledTimes(1);
    });
  });

  describe('findExpiryCandidates', () => {
    it('pages wallets with a positive balance of never-paid organizations past the window', async () => {
      walletFindMany.mockResolvedValue([
        { organizationId: 'org_a' },
        { organizationId: null },
      ]);

      await expect(
        buildService().findExpiryCandidates(PAST_WINDOW, 'org_0', 100),
      ).resolves.toEqual(['org_a']);
      const query = walletFindMany.mock.calls[0][0];
      expect(query.take).toBe(100);
      expect(query.orderBy).toEqual({ organizationId: 'asc' });
      expect(query.where).toMatchObject({
        balance: { gt: 0 },
        isDeleted: false,
        organizationId: { gt: 'org_0', not: null },
        organization: {
          is: {
            createdAt: { lte: new Date('2026-10-01T09:00:00.001Z') },
            isDeleted: false,
            isProactiveOnboarding: false,
            warmupAccounts: { none: { isDeleted: false } },
          },
        },
      });
      expect(query.where.organization.is.subscriptions.none).toBeDefined();
      expect(query.where.organization.is.creditTransactions.none).toBeDefined();
    });
  });
});
