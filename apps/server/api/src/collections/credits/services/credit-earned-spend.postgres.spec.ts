import { randomUUID } from 'node:crypto';
import { BillingAccountsService } from '@api/collections/billing-accounts/services/billing-accounts.service';
import { CreditBalanceService } from '@api/collections/credits/services/credit-balance.service';
import { CreditReservationService } from '@api/collections/credits/services/credit-reservation.service';
import { CreditTransactionsService } from '@api/collections/credits/services/credit-transactions.service';
import { CreditTransfersService } from '@api/collections/credits/services/credit-transfers.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { FreeTrialService } from '@api/collections/credits/services/free-trial.service';
import type { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import type { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import type { CacheInvalidationService } from '@api/common/services/cache-invalidation.service';
import { FreeTrialExpiredException } from '@api/exceptions/business-logic.exception';
import { TransactionUtil } from '@api/helpers/utils/transaction/transaction.util';
import type { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ActivitySource,
  CreditTransactionCategory,
  CreditTransferKind,
} from '@genfeedai/contracts';
import { PrismaClient } from '@genfeedai/prisma';
import type { ConfigService } from '@libs/config/config.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

vi.unmock('@genfeedai/prisma');
vi.unmock('@prisma/adapter-pg');

// Explicit opt-in only: an isolated migrated database, never DATABASE_URL.
const connectionString = process.env.BILLING_ACCOUNT_SCOPE_TEST_DATABASE_URL;

type Workspace = {
  billingAccountId: string;
  organizationId: string;
  userId: string;
};

describe.skipIf(!connectionString)(
  'earned credits after a trial and through refunds (PostgreSQL)',
  () => {
    const prisma = connectionString
      ? new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
      : null;
    const database = () => {
      if (!prisma) throw new Error('A test database URL is required');
      return prisma;
    };
    const logger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    } as unknown as LoggerService;
    let suffix: string;
    let reader: Workspace;
    let creator: Workspace;
    let transfers: CreditTransfersService;
    let credits: CreditsUtilsService;

    function workspace(role: string): Workspace {
      return {
        billingAccountId: `es-${role}-billing-${suffix}`,
        organizationId: `es-${role}-org-${suffix}`,
        userId: `es-${role}-user-${suffix}`,
      };
    }

    async function seedWorkspace(
      owner: Workspace,
      wallet: {
        balance: number;
        createdAt?: Date;
        earnedBalance?: number;
        paid: boolean;
      },
    ): Promise<void> {
      const db = database();
      await db.user.create({
        data: { handle: owner.userId, id: owner.userId },
      });
      await db.billingAccount.create({ data: { id: owner.billingAccountId } });
      await db.organization.create({
        data: {
          billingAccountId: owner.billingAccountId,
          id: owner.organizationId,
          createdAt: wallet.createdAt,
          label: owner.organizationId,
          slug: owner.organizationId,
          userId: owner.userId,
        },
      });
      await db.organizationSetting.create({
        data: { organizationId: owner.organizationId },
      });
      await db.creditBalance.create({
        data: {
          balance: wallet.balance,
          billingAccountId: owner.billingAccountId,
          earnedBalance: wallet.earnedBalance ?? 0,
          heldAmount: 0,
          organizationId: owner.organizationId,
          version: 0,
        },
      });
      if (wallet.paid) {
        await db.creditTransaction.create({
          data: {
            amount: wallet.balance,
            balanceAfter: wallet.balance,
            billingAccountId: owner.billingAccountId,
            category: CreditTransactionCategory.ADD,
            organizationId: owner.organizationId,
            source: ActivitySource.PAY_AS_YOU_GO,
          },
        });
      }
    }

    const wallet = (owner: Workspace) =>
      database().creditBalance.findFirstOrThrow({
        select: { balance: true, earnedBalance: true, earnedSpent: true },
        where: { isDeleted: false, organizationId: owner.organizationId },
      });

    beforeEach(() => {
      vi.stubEnv('GENFEED_CLOUD', '1');
      suffix = randomUUID();
      reader = workspace('reader');
      creator = workspace('creator');
      const prismaService = database() as unknown as PrismaService;
      const transaction = new TransactionUtil(prismaService, logger);
      const balance = new CreditBalanceService(prismaService, logger);
      const ledger = new CreditTransactionsService(
        prismaService,
        logger,
        balance,
        {
          invalidate: vi.fn().mockResolvedValue(undefined),
        } as unknown as CacheInvalidationService,
      );
      const socket = {
        emit: vi.fn().mockResolvedValue(undefined),
      } as unknown as NotificationsPublisherService;
      const cache = {
        invalidateForOrganization: vi.fn().mockResolvedValue(undefined),
      } as unknown as AccessBootstrapCacheService;
      const settings = {
        findOneSelect: (
          where: { organizationId: string },
          select: { hasEverHadCredits: true; id: true },
        ) => database().organizationSetting.findFirst({ select, where }),
        patch: (id: string, data: { hasEverHadCredits: boolean }) =>
          database().organizationSetting.update({ data, where: { id } }),
      } as unknown as OrganizationSettingsService;
      const billingAccounts = new BillingAccountsService(prismaService, logger);
      const freeTrial = new FreeTrialService(
        prismaService,
        transaction,
        balance,
        ledger,
        socket,
        cache,
        logger,
        { get: () => undefined } as unknown as ConfigService,
      );
      credits = new CreditsUtilsService(
        logger,
        prismaService,
        billingAccounts,
        balance,
        new CreditReservationService(
          prismaService,
          logger,
          balance,
          ledger,
          transaction,
        ),
        ledger,
        settings,
        socket,
        cache,
        transaction,
        freeTrial,
      );
      transfers = new CreditTransfersService(
        billingAccounts,
        balance,
        ledger,
        transaction,
        socket,
        cache,
        logger,
      );
    });

    afterEach(async () => {
      vi.unstubAllEnvs();
      const db = database();
      const organizationIds = [reader.organizationId, creator.organizationId];
      await db.activity.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await db.creditTransaction.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await db.creditReservation.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await db.creditBalance.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await db.organizationSetting.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await db.organization.deleteMany({
        where: { id: { in: organizationIds } },
      });
      await db.billingAccount.deleteMany({
        where: {
          id: { in: [reader.billingAccountId, creator.billingAccountId] },
        },
      });
      await db.user.deleteMany({
        where: { id: { in: [reader.userId, creator.userId] } },
      });
    });

    afterAll(async () => {
      await prisma?.$disconnect();
    });

    const tenDaysAgo = () => new Date(Date.now() - 10 * 24 * 3_600_000);
    const refundExpiry = new Date('2030-01-01T00:00:00Z');

    describe('a never-paid organization whose trial has ended', () => {
      async function seedExpiredTrialWithTip(): Promise<void> {
        await seedWorkspace(reader, { balance: 100, paid: true });
        await seedWorkspace(creator, {
          balance: 20,
          createdAt: tenDaysAgo(),
          paid: false,
        });
        await transfers.transfer({
          amount: 8,
          idempotencyKey: 'trial-tip',
          kind: CreditTransferKind.TIP,
          message: 'Loved this piece',
          payeeOrganizationId: creator.organizationId,
          payerOrganizationId: reader.organizationId,
          payerUserId: reader.userId,
        });
      }

      it('spends its earned credits and is refused above them, with the unearned trial credits gone', async () => {
        await seedExpiredTrialWithTip();
        expect(await wallet(creator)).toMatchObject({
          balance: 28,
          earnedBalance: 8,
        });

        await expect(
          credits.checkOrganizationCreditsAvailable(creator.organizationId, 8),
        ).resolves.toBe(true);
        await expect(
          credits.checkOrganizationCreditsAvailable(creator.organizationId, 9),
        ).resolves.toBe(false);

        await credits.deductCreditsFromOrganization(
          creator.organizationId,
          creator.userId,
          5,
          'Image generation',
          ActivitySource.SCRIPT,
        );
        expect(await wallet(creator)).toMatchObject({
          balance: 3,
          earnedBalance: 3,
        });

        await expect(
          credits.deductCreditsFromOrganization(
            creator.organizationId,
            creator.userId,
            4,
            'Image generation',
            ActivitySource.SCRIPT,
          ),
        ).rejects.toMatchObject({ errorCode: 'INSUFFICIENT_CREDITS' });
        expect(await wallet(creator)).toMatchObject({
          balance: 3,
          earnedBalance: 3,
        });

        const expired = await database().creditTransaction.findMany({
          where: {
            category: CreditTransactionCategory.EXPIRE,
            organizationId: creator.organizationId,
          },
        });
        expect(expired.map((row) => row.amount)).toEqual([20]);
      });

      it('reserves up to its earned credits and no more', async () => {
        await seedExpiredTrialWithTip();
        const reserve = (amount: number, key: string) =>
          credits.reserveCredits({
            actorUserId: creator.userId,
            amount,
            description: 'Image generation',
            idempotencyKey: key,
            organizationId: creator.organizationId,
            source: ActivitySource.SCRIPT,
            workloadId: key,
            workloadType: 'earned-spend-test',
          });

        await expect(reserve(9, 'too-much')).rejects.toBeInstanceOf(
          FreeTrialExpiredException,
        );
        const hold = await reserve(8, 'within-earned');
        expect(hold.amount).toBe(8);
      });

      it('still spends its trial credits while the trial is running', async () => {
        await seedWorkspace(creator, { balance: 20, paid: false });

        await credits.deductCreditsFromOrganization(
          creator.organizationId,
          creator.userId,
          20,
          'Image generation',
          ActivitySource.SCRIPT,
        );
        expect(await wallet(creator)).toMatchObject({ balance: 0 });
      });
    });

    describe('a refund of a spend that used earned credits', () => {
      it('restores the earned part, which then survives a plan reset', async () => {
        await seedWorkspace(creator, {
          balance: 10,
          earnedBalance: 6,
          paid: true,
        });

        await credits.deductCreditsFromOrganization(
          creator.organizationId,
          creator.userId,
          7,
          'Image generation',
          ActivitySource.SCRIPT,
        );
        expect(await wallet(creator)).toMatchObject({
          balance: 3,
          earnedBalance: 3,
          earnedSpent: 3,
        });

        await credits.refundOrganizationCredits(
          creator.organizationId,
          7,
          'generation-refund',
          'Generation failed',
          refundExpiry,
          { idempotencyKey: 'refund-1' },
        );
        expect(await wallet(creator)).toMatchObject({
          balance: 10,
          earnedBalance: 6,
          earnedSpent: 0,
        });

        await credits.resetOrganizationCredits(
          creator.organizationId,
          100,
          'monthly',
          'Monthly plan reset',
        );
        expect(await wallet(creator)).toMatchObject({
          balance: 106,
          earnedBalance: 6,
        });
      });

      it('records the earned part on the charge and on its refund, and never restores more than was spent', async () => {
        await seedWorkspace(creator, {
          balance: 10,
          earnedBalance: 6,
          paid: true,
        });

        await credits.deductCreditsFromOrganization(
          creator.organizationId,
          creator.userId,
          7,
          'Image generation',
          ActivitySource.SCRIPT,
          { idempotencyKey: 'charge-1' },
        );
        await credits.refundOrganizationCredits(
          creator.organizationId,
          20,
          'generation-refund',
          'Goodwill refund',
          refundExpiry,
          { idempotencyKey: 'refund-2' },
        );

        const earnedAmountOn = async (category: CreditTransactionCategory) => {
          const row = await database().creditTransaction.findFirstOrThrow({
            select: { metadata: true },
            where: { category, organizationId: creator.organizationId },
          });
          return (row.metadata as { earnedAmount?: number } | null)
            ?.earnedAmount;
        };
        expect(await earnedAmountOn(CreditTransactionCategory.DEDUCT)).toBe(3);
        expect(await earnedAmountOn(CreditTransactionCategory.REFUND)).toBe(3);
        expect(await wallet(creator)).toMatchObject({
          balance: 23,
          earnedBalance: 6,
          earnedSpent: 0,
        });
      });

      it('does not restore earned credits for a spend that used only purchased ones', async () => {
        await seedWorkspace(creator, {
          balance: 10,
          earnedBalance: 6,
          paid: true,
        });

        await credits.deductCreditsFromOrganization(
          creator.organizationId,
          creator.userId,
          4,
          'Image generation',
          ActivitySource.SCRIPT,
        );
        await credits.refundOrganizationCredits(
          creator.organizationId,
          4,
          'generation-refund',
          'Generation failed',
          refundExpiry,
        );

        expect(await wallet(creator)).toMatchObject({
          balance: 10,
          earnedBalance: 6,
          earnedSpent: 0,
        });
      });

      it('records the earned part when a reservation settles and restores it on refund', async () => {
        await seedWorkspace(creator, {
          balance: 10,
          earnedBalance: 6,
          paid: true,
        });

        const hold = await credits.reserveCredits({
          actorUserId: creator.userId,
          amount: 7,
          description: 'Image generation',
          idempotencyKey: 'hold-1',
          organizationId: creator.organizationId,
          source: ActivitySource.SCRIPT,
          workloadId: 'hold-1',
          workloadType: 'earned-spend-test',
        });
        await credits.settleReservation({
          actorUserId: creator.userId,
          actualAmount: 7,
          description: 'Image generation',
          organizationId: creator.organizationId,
          reservationId: hold.id,
        });
        expect(await wallet(creator)).toMatchObject({
          balance: 3,
          earnedBalance: 3,
          earnedSpent: 3,
        });
        const settlement = await database().creditTransaction.findFirstOrThrow({
          select: { metadata: true },
          where: {
            category: CreditTransactionCategory.DEDUCT,
            organizationId: creator.organizationId,
          },
        });
        expect(settlement.metadata).toMatchObject({ earnedAmount: 3 });

        await credits.refundOrganizationCredits(
          creator.organizationId,
          7,
          'generation-refund',
          'Generation failed',
          refundExpiry,
        );
        expect(await wallet(creator)).toMatchObject({
          balance: 10,
          earnedBalance: 6,
          earnedSpent: 0,
        });
      });
    });
  },
);
