import { randomUUID } from 'node:crypto';
import { BillingAccountsService } from '@api/collections/billing-accounts/services/billing-accounts.service';
import { CreditBalanceService } from '@api/collections/credits/services/credit-balance.service';
import { CreditReservationService } from '@api/collections/credits/services/credit-reservation.service';
import { CreditTransactionsService } from '@api/collections/credits/services/credit-transactions.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { OnboardingCreditGrantsService } from '@api/collections/credits/services/onboarding-credit-grants.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import type { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import type { CacheInvalidationService } from '@api/common/services/cache-invalidation.service';
import { TransactionUtil } from '@api/helpers/utils/transaction/transaction.util';
import type { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  CreditReservationStatus,
  CreditTransactionCategory,
} from '@genfeedai/contracts';
import {
  type IOnboardingJourneyMissionState,
  ONBOARDING_JOURNEY_MISSIONS,
} from '@genfeedai/contracts/types';
import { PrismaClient } from '@genfeedai/prisma';
import type { LoggerService } from '@libs/logger/logger.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

vi.unmock('@genfeedai/prisma');
vi.unmock('@prisma/adapter-pg');

// Explicit opt-in only: use an isolated migrated database, never DATABASE_URL.
const connectionString = process.env.ONBOARDING_CREDITS_TEST_DATABASE_URL;

describe.skipIf(!connectionString)(
  'onboarding grants PostgreSQL atomicity',
  () => {
    const prisma = connectionString
      ? new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
      : null;
    const database = () => {
      if (!prisma)
        throw new Error('ONBOARDING_CREDITS_TEST_DATABASE_URL is required');
      return prisma;
    };
    const logger = {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as unknown as LoggerService;
    const socket = { emit: vi.fn().mockResolvedValue(undefined) };
    const cache = {
      invalidateForOrganization: vi.fn().mockResolvedValue(undefined),
    };
    let userId: string;
    let organizationIds: [string, string];
    let billingAccountIds: [string, string];
    let credits: CreditsUtilsService;
    let reservations: CreditReservationService;
    let balance: CreditBalanceService;
    let transaction: TransactionUtil;
    let service: OnboardingCreditGrantsService;

    beforeAll(async () => {
      const indexes = await database().$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'credit_transactions'
        AND indexname = 'credit_transactions_idempotencyKey_active_key'
    `;
      expect(indexes).toHaveLength(1);
    });

    beforeEach(async () => {
      vi.stubEnv('GENFEED_CLOUD', '1');
      const suffix = randomUUID();
      userId = `onboarding-pg-user-${suffix}`;
      organizationIds = [
        `onboarding-pg-org-a-${suffix}`,
        `onboarding-pg-org-b-${suffix}`,
      ];
      billingAccountIds = [
        `onboarding-pg-billing-a-${suffix}`,
        `onboarding-pg-billing-b-${suffix}`,
      ];
      const db = database();
      await db.user.create({ data: { id: userId, handle: userId } });
      for (const [index, organizationId] of organizationIds.entries()) {
        await db.billingAccount.create({
          data: { id: billingAccountIds[index] },
        });
        await db.organization.create({
          data: {
            id: organizationId,
            userId,
            label: organizationId,
            slug: organizationId,
            billingAccountId: billingAccountIds[index],
          },
        });
        await db.organizationSetting.create({ data: { organizationId } });
        await db.creditBalance.create({
          data: {
            organizationId,
            billingAccountId: billingAccountIds[index],
            balance: 0,
            heldAmount: 0,
            version: 0,
          },
        });
      }
      const prismaService = db as unknown as PrismaService;
      transaction = new TransactionUtil(prismaService, logger);
      balance = new CreditBalanceService(prismaService, logger);
      const ledger = new CreditTransactionsService(
        prismaService,
        logger,
        balance,
        {
          invalidate: vi.fn().mockResolvedValue(undefined),
        } as unknown as CacheInvalidationService,
      );
      const settings = {
        normalizeJourneyState:
          OrganizationSettingsService.prototype.normalizeJourneyState,
        findOne: (where: { organizationId: string }) =>
          db.organizationSetting.findFirst({ where }),
        patch: (id: string, data: { hasEverHadCredits: boolean }) =>
          db.organizationSetting.update({ where: { id }, data }),
      } as unknown as OrganizationSettingsService;
      reservations = new CreditReservationService(
        prismaService,
        logger,
        balance,
        ledger,
        transaction,
      );
      credits = new CreditsUtilsService(
        logger,
        new EventEmitter2(),
        prismaService,
        new BillingAccountsService(prismaService, logger),
        balance,
        reservations,
        ledger,
        settings,
        socket as unknown as NotificationsPublisherService,
        cache as unknown as AccessBootstrapCacheService,
        transaction,
      );
      service = new OnboardingCreditGrantsService(
        transaction,
        settings,
        credits,
      );
      vi.clearAllMocks();
    });

    afterEach(async () => {
      vi.restoreAllMocks();
      vi.unstubAllEnvs();
      if (!organizationIds) return;
      const db = database();
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
        where: { id: { in: billingAccountIds } },
      });
      await db.user.deleteMany({ where: { id: userId } });
    });
    afterAll(async () => {
      await prisma?.$disconnect();
    });

    // Both first attempts have read their authoritative claim state before either
    // performs the real wallet/ledger write. Retry attempts do not wait again.
    function overlapFirstGrantAttempts() {
      let arrivals = 0;
      let release: () => void = () => {};
      const ready = new Promise<void>((resolve) => {
        release = resolve;
      });
      const write = credits.addPromotionalCreditsInTransaction.bind(credits);
      vi.spyOn(
        credits,
        'addPromotionalCreditsInTransaction',
      ).mockImplementation(async (input, tx) => {
        arrivals += 1;
        if (arrivals === 2) release();
        if (arrivals <= 2) await ready;
        return write(input, tx);
      });
    }

    it('grants only 25 credits when one user signs up concurrently in two owned organizations', async () => {
      overlapFirstGrantAttempts();
      await Promise.all(
        organizationIds.map((id) => service.grantSignupGift(id, userId)),
      );
      const rows = await database().creditTransaction.findMany({
        where: { organizationId: { in: organizationIds }, isDeleted: false },
      });
      const wallets = await database().creditBalance.findMany({
        where: { organizationId: { in: organizationIds }, isDeleted: false },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        amount: 25,
        source: 'onboarding-signup-gift',
        actorUserId: userId,
        referenceId: userId,
      });
      expect(wallets.reduce((sum, wallet) => sum + wallet.balance, 0)).toBe(25);
      await Promise.all(
        organizationIds.map((id) => service.grantSignupGift(id, userId)),
      );
      expect(
        await database().creditTransaction.count({
          where: { organizationId: { in: organizationIds }, isDeleted: false },
        }),
      ).toBe(1);
    }, 30_000);

    it('accepts concurrent signup retries for the same organization with one welcome grant', async () => {
      overlapFirstGrantAttempts();
      const org = organizationIds[0];
      const outcomes = await Promise.allSettled([
        service.grantSignupGift(org, userId),
        service.grantSignupGift(org, userId),
      ]);
      expect(outcomes).toEqual([
        { status: 'fulfilled', value: undefined },
        { status: 'fulfilled', value: undefined },
      ]);
      const rows = await database().creditTransaction.findMany({
        where: { organizationId: org, isDeleted: false },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        amount: 25,
        source: 'onboarding-signup-gift',
        actorUserId: userId,
        idempotencyKey: `onboarding:welcome:${userId}`,
        referenceId: userId,
      });
      expect(
        await database().creditBalance.findFirstOrThrow({
          where: { organizationId: org, isDeleted: false },
        }),
      ).toMatchObject({ balance: 25, heldAmount: 0 });
      await service.grantSignupGift(org, userId);
      expect(
        await database().creditTransaction.count({
          where: { organizationId: org, isDeleted: false },
        }),
      ).toBe(1);
    }, 30_000);

    it('accepts concurrent completion of the same mission with one claim and reward', async () => {
      overlapFirstGrantAttempts();
      const org = organizationIds[0];
      const outcomes = await Promise.allSettled([
        service.completeMissions(org, ['complete_company_info'], userId),
        service.completeMissions(org, ['complete_company_info'], userId),
      ]);
      expect(
        outcomes.filter((outcome) => outcome.status === 'rejected'),
      ).toEqual([]);
      const settings = await database().organizationSetting.findUniqueOrThrow({
        where: { organizationId: org },
      });
      const missions =
        settings.onboardingJourneyMissions as unknown as IOnboardingJourneyMissionState[];
      expect(missions.filter((mission) => mission.rewardClaimed)).toEqual([
        expect.objectContaining({
          id: 'complete_company_info',
          isCompleted: true,
          rewardClaimed: true,
          rewardCredits: 25,
        }),
      ]);
      const rows = await database().creditTransaction.findMany({
        where: { organizationId: org, isDeleted: false },
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        amount: 25,
        source: 'onboarding-journey',
        actorUserId: userId,
        idempotencyKey: `onboarding:mission:${org}:complete_company_info`,
        referenceId: 'complete_company_info',
      });
      expect(
        await database().creditBalance.findFirstOrThrow({
          where: { organizationId: org, isDeleted: false },
        }),
      ).toMatchObject({ balance: 25, heldAmount: 0 });
      await service.completeMissions(org, ['complete_company_info'], userId);
      expect(
        await database().creditTransaction.count({
          where: { organizationId: org, isDeleted: false },
        }),
      ).toBe(1);
    }, 30_000);

    it('merges parallel different missions with exact ledger and wallet totals', async () => {
      overlapFirstGrantAttempts();
      const org = organizationIds[0];
      await Promise.all([
        service.completeMissions(org, ['complete_company_info'], userId),
        service.completeMissions(org, ['publish_first_post'], userId),
      ]);
      await Promise.all([
        service.completeMissions(org, ['complete_company_info'], userId),
        service.completeMissions(org, ['publish_first_post'], userId),
      ]);
      const settings = await database().organizationSetting.findUniqueOrThrow({
        where: { organizationId: org },
      });
      const missions =
        settings.onboardingJourneyMissions as unknown as IOnboardingJourneyMissionState[];
      const completedIds = ['complete_company_info', 'publish_first_post'];
      expect(
        missions
          .filter((mission) => mission.rewardClaimed)
          .map((mission) => mission.id)
          .sort(),
      ).toEqual([...completedIds].sort());
      expect(missions.filter((mission) => mission.isCompleted)).toHaveLength(2);
      const expected = ONBOARDING_JOURNEY_MISSIONS.filter((mission) =>
        completedIds.includes(mission.id),
      ).reduce((sum, mission) => sum + mission.rewardCredits, 0);
      const rows = await database().creditTransaction.findMany({
        where: { organizationId: org, isDeleted: false },
      });
      const wallet = await database().creditBalance.findFirstOrThrow({
        where: { organizationId: org, isDeleted: false },
      });
      expect(rows).toHaveLength(2);
      expect(rows.reduce((sum, row) => sum + row.amount, 0)).toBe(expected);
      expect(wallet.balance).toBe(expected);
      expect(
        rows.every(
          (row) =>
            row.source === 'onboarding-journey' && row.actorUserId === userId,
        ),
      ).toBe(true);
    }, 30_000);

    it('reserves and settles parallel workloads once with exact wallet totals', async () => {
      const org = organizationIds[0];
      const db = database();
      await db.creditBalance.updateMany({
        where: { organizationId: org, isDeleted: false },
        data: { balance: 100 },
      });
      const overlapWalletWrites = () => {
        let arrivals = 0;
        let release: () => void = () => {};
        const ready = new Promise<void>((resolve) => {
          release = resolve;
        });
        const apply = balance.applyDelta.bind(balance);
        return vi
          .spyOn(balance, 'applyDelta')
          .mockImplementation(async (...args) => {
            arrivals += 1;
            if (arrivals === 2) release();
            if (arrivals <= 2) await ready;
            return apply(...args);
          });
      };
      const reserveBarrier = overlapWalletWrites();
      const held = await Promise.all(
        [20, 30].map((amount, index) =>
          reservations.reserve({
            organizationId: org,
            billingAccountId: billingAccountIds[0],
            actorUserId: userId,
            amount,
            idempotencyKey: `${org}:reservation:${index}`,
          }),
        ),
      );
      reserveBarrier.mockRestore();
      expect(
        await db.creditReservation.count({
          where: {
            organizationId: org,
            isDeleted: false,
            status: CreditReservationStatus.RESERVED,
          },
        }),
      ).toBe(2);
      expect(
        await db.creditBalance.findFirstOrThrow({
          where: { organizationId: org, isDeleted: false },
        }),
      ).toMatchObject({ balance: 100, heldAmount: 50 });
      const settleInputs = held.map((reservation, index) => ({
        organizationId: org,
        reservationId: reservation.id,
        actorUserId: userId,
        actualAmount: index === 0 ? 15 : 25,
        description: 'PostgreSQL concurrent settlement',
      }));
      const settlementBarrier = overlapWalletWrites();
      await Promise.all(
        settleInputs.map((input) => reservations.settle(input)),
      );
      settlementBarrier.mockRestore();
      await Promise.all(
        settleInputs.map((input) => reservations.settle(input)),
      );
      expect(
        await db.creditBalance.findFirstOrThrow({
          where: { organizationId: org, isDeleted: false },
        }),
      ).toMatchObject({ balance: 60, heldAmount: 0 });
      const settled = await db.creditReservation.findMany({
        where: { organizationId: org, isDeleted: false },
      });
      expect(settled).toHaveLength(2);
      expect(
        settled.every(
          (reservation) =>
            reservation.status === CreditReservationStatus.SETTLED,
        ),
      ).toBe(true);
      expect(
        settled.reduce(
          (sum, reservation) => sum + (reservation.settledAmount ?? 0),
          0,
        ),
      ).toBe(40);
      const deductions = await db.creditTransaction.findMany({
        where: {
          organizationId: org,
          isDeleted: false,
          category: CreditTransactionCategory.DEDUCT,
        },
      });
      expect(deductions).toHaveLength(2);
      expect(deductions.reduce((sum, entry) => sum + entry.amount, 0)).toBe(40);
    }, 30_000);

    it('rolls back mission claims, real ledger entries and wallet writes on a pre-commit failure', async () => {
      const run = transaction.runInTransaction.bind(transaction);
      vi.spyOn(transaction, 'runInTransaction').mockImplementation(
        (operation, options) =>
          run(async (tx) => {
            await operation(tx);
            throw new Error('forced failure before commit');
          }, options),
      );
      await expect(
        service.completeMissions(
          organizationIds[0],
          ['complete_company_info'],
          userId,
        ),
      ).rejects.toThrow('forced failure before commit');
      const db = database();
      const settings = await db.organizationSetting.findUniqueOrThrow({
        where: { organizationId: organizationIds[0] },
      });
      const missions =
        OrganizationSettingsService.prototype.normalizeJourneyState(
          settings.onboardingJourneyMissions as unknown as IOnboardingJourneyMissionState[],
        );
      expect(
        missions.some(
          (mission) => mission.rewardClaimed || mission.isCompleted,
        ),
      ).toBe(false);
      expect(
        await db.creditTransaction.count({
          where: { organizationId: organizationIds[0], isDeleted: false },
        }),
      ).toBe(0);
      expect(
        (
          await db.creditBalance.findFirstOrThrow({
            where: { organizationId: organizationIds[0], isDeleted: false },
          })
        ).balance,
      ).toBe(0);
      expect(socket.emit).not.toHaveBeenCalled();
      expect(cache.invalidateForOrganization).not.toHaveBeenCalled();
    }, 30_000);
  },
);
