import { randomUUID } from 'node:crypto';
import { BillingAccountsService } from '@api/collections/billing-accounts/services/billing-accounts.service';
import { CreditBalanceService } from '@api/collections/credits/services/credit-balance.service';
import { CreditReservationService } from '@api/collections/credits/services/credit-reservation.service';
import { CreditTransactionsService } from '@api/collections/credits/services/credit-transactions.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { GenerationHoldRecoveryService } from '@api/collections/credits/services/generation-hold-recovery.service';
import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { AdminCreditHoldsController } from '@api/endpoints/admin/credit-holds/credit-holds.controller';
import { TransactionUtil } from '@api/helpers/utils/transaction/transaction.util';
import { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ActivitySource,
  CreditHoldRecoveryAction,
  CreditReservationStatus,
  CreditTransactionCategory,
} from '@genfeedai/contracts';
import { PrismaClient } from '@genfeedai/prisma';
import { runWithTenantContext } from '@libs/prisma/tenant-context';
import { createTenantGuardExtension } from '@libs/prisma/tenant-guard.extension';
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

const connectionString = process.env.CREDIT_HOLD_RECOVERY_TEST_DATABASE_URL;
if (connectionString) {
  const url = new URL(connectionString);
  if (
    !['127.0.0.1', 'localhost'].includes(url.hostname) ||
    url.port !== '55496' ||
    url.pathname !== '/credit_hold_5946_test'
  )
    throw new Error(
      'Credit hold recovery tests require the dedicated loopback credit_hold_5946_test database',
    );
}

// No DATABASE_URL fallback: this suite can only touch a dedicated disposable database.
describe.skipIf(!connectionString)(
  'credit hold recovery monetary concurrency (PostgreSQL)',
  () => {
    const db = connectionString
      ? new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
      : null;
    function database() {
      if (!db)
        throw new Error('CREDIT_HOLD_RECOVERY_TEST_DATABASE_URL is required');
      return db;
    }
    const logger = {
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };
    let org: string;
    let account: string;
    let user: string;
    let hold: string;
    let reservations: CreditReservationService;
    let recovery: GenerationHoldRecoveryService;
    let recorder: ActivityRecorderService;
    let credits: CreditsUtilsService;
    let balance: CreditBalanceService;

    beforeEach(async () => {
      vi.stubEnv('GENFEED_CLOUD', '1');
      const client = database();
      const suffix = randomUUID();
      org = `hold-org-${suffix}`;
      account = `hold-wallet-${suffix}`;
      user = `hold-payer-${suffix}`;
      hold = `hold-${suffix}`;
      await client.user.create({ data: { id: user, handle: user } });
      await client.billingAccount.create({ data: { id: account } });
      await client.organization.create({
        data: {
          id: org,
          userId: user,
          label: org,
          slug: org,
          billingAccountId: account,
        },
      });
      await client.creditBalance.create({
        data: {
          organizationId: org,
          billingAccountId: account,
          balance: 100,
          heldAmount: 12,
        },
      });
      await client.creditReservation.create({
        data: {
          id: hold,
          organizationId: org,
          billingAccountId: account,
          actorUserId: user,
          amount: 12,
          status: CreditReservationStatus.RESERVED,
          expiresAt: new Date(0),
          idempotencyKey: `reserved:${hold}`,
          workloadType: 'media-generation',
          workloadId: `asset-${suffix}`,
          metadata: {
            assetId: `asset-${suffix}`,
            submissionIntent: { version: 1, provider: 'heygen' },
          },
        },
      });
      const prisma = client.$extends(
        createTenantGuardExtension({
          isCloud: true,
          tenantModelNames: new Set([
            'CreditReservation',
            'CreditBalance',
            'CreditTransaction',
            'Ingredient',
            'CrunGenerationTask',
            'Activity',
          ]),
        }),
      ) as unknown as PrismaService;
      balance = new CreditBalanceService(prisma, logger as never);
      const ledger = new CreditTransactionsService(
        prisma,
        logger as never,
        balance,
        { invalidate: vi.fn() } as never,
      );
      reservations = new CreditReservationService(
        prisma,
        logger as never,
        balance,
        ledger,
        new TransactionUtil(prisma, logger as never),
      );
      credits = new CreditsUtilsService(
        logger as never,
        prisma,
        new BillingAccountsService(prisma, logger as never),
        balance,
        reservations,
        ledger,
        {} as never,
        { emit: vi.fn() } as never,
        { invalidateForOrganization: vi.fn() } as never,
        new TransactionUtil(prisma, logger as never),
      );
      recorder = new ActivityRecorderService(
        prisma,
        { add: vi.fn() } as never,
        { publish: vi.fn() } as never,
        logger as never,
      );
      // Only the real transaction recorder is used; downstream notification transport is outside this money test.
      vi.spyOn(recorder, 'afterCommit').mockResolvedValue(undefined);
      recovery = new GenerationHoldRecoveryService(
        prisma,
        reservations,
        recorder,
        {} as never,
        {} as never,
        {} as never,
        logger as never,
        { invalidateForOrganization: vi.fn() } as never,
      );
    });
    afterEach(async () => {
      vi.restoreAllMocks();
      vi.unstubAllEnvs();
      const client = database();
      await client.activity.deleteMany({ where: { organizationId: org } });
      await client.creditTransaction.deleteMany({
        where: { organizationId: org },
      });
      await client.creditReservation.deleteMany({
        where: { organizationId: org },
      });
      await client.ingredient.deleteMany({ where: { organizationId: org } });
      await client.creditBalance.deleteMany({
        where: { billingAccountId: { in: [account, `${account}-relinked`] } },
      });
      await client.organization.deleteMany({ where: { id: org } });
      await client.billingAccount.deleteMany({
        where: { id: { in: [account, `${account}-relinked`] } },
      });
      await client.user.deleteMany({ where: { id: user } });
    });
    afterAll(async () => {
      await db?.$disconnect();
    });

    const act = (action: CreditHoldRecoveryAction) =>
      recovery.apply({
        organizationId: org,
        reservationId: hold,
        action,
        operatorUserId: 'operator',
        reason: 'Provider reviewed by the operator',
      });
    async function assertMoney(
      expectedBalance: number,
      expectedCharges: number,
    ) {
      const client = database();
      expect(
        await client.creditBalance.findFirst({
          where: { organizationId: org },
        }),
      ).toEqual(
        expect.objectContaining({
          balance: expectedBalance,
          heldAmount: 0,
          billingAccountId: account,
        }),
      );
      expect(
        await client.creditTransaction.count({
          where: { organizationId: org },
        }),
      ).toBe(expectedCharges);
    }
    function overlapRecoveryClaims() {
      const original = reservations.settleInTransaction.bind(reservations);
      let arrivals = 0;
      let release = () => {};
      const barrier = new Promise<void>((resolve) => {
        release = resolve;
      });
      vi.spyOn(reservations, 'settleInTransaction').mockImplementation(
        async (...args) => {
          arrivals += 1;
          if (arrivals === 2) release();
          if (arrivals <= 2) await barrier;
          return original(...args);
        },
      );
    }

    it('guarded admin routes switch the operator tenant to the selected organization without bypassing tenant isolation', async () => {
      const controller = new AdminCreditHoldsController(recovery);
      const request = {
        protocol: 'http',
        get: () => 'localhost',
        originalUrl: `/admin/organizations/${org}/credit-holds`,
        context: {
          userId: 'operator',
          organizationId: 'operator-home',
          isSuperAdmin: true,
        },
      };
      const context = { switchToHttp: () => ({ getRequest: () => request }) };
      expect(new SuperAdminGuard().canActivate(context as never)).toBe(true);
      await runWithTenantContext(
        { organizationId: 'operator-home' },
        async () => {
          await expect(recovery.list(org)).rejects.toThrow('organizationId');
          await controller.list(request as never, org);
          await controller.act(request as never, org, hold, {
            action: 'charge',
            reason: 'Provider completion verified',
          });
          await expect(recovery.list(org)).rejects.toThrow('organizationId');
        },
      );
      await assertMoney(88, 1);
      request.context.isSuperAdmin = false;
      expect(() => new SuperAdminGuard().canActivate(context as never)).toThrow(
        'Super admin access required',
      );
      await runWithTenantContext(
        { organizationId: 'operator-home' },
        async () =>
          expect(
            recovery.apply({
              organizationId: 'operator-home',
              reservationId: hold,
              action: CreditHoldRecoveryAction.CHARGE,
              reason: 'Attempt to use foreign hold',
            }),
          ).rejects.toThrow('Credit hold not found'),
      );
    });

    it('deducts once when two operators charge concurrently and records both attempts atomically', async () => {
      overlapRecoveryClaims();
      await Promise.all([
        act(CreditHoldRecoveryAction.CHARGE),
        act(CreditHoldRecoveryAction.CHARGE),
      ]);
      await assertMoney(88, 1);
      expect(
        await database().activity.count({
          where: {
            organizationId: org,
            data: { path: ['operation'], equals: 'media-credit-hold-recovery' },
          },
        }),
      ).toBe(2);
      expect(
        await database().creditTransaction.findFirst({
          where: { organizationId: org },
        }),
      ).toEqual(
        expect.objectContaining({
          actorUserId: user,
          idempotencyKey: `media-generation-late-settle:${hold}`,
          referenceId: hold,
        }),
      );
    });

    it('a webhook using the old normal key and operator charge still deduct once', async () => {
      overlapRecoveryClaims();
      await Promise.all([
        act(CreditHoldRecoveryAction.CHARGE),
        reservations.settle({
          organizationId: org,
          reservationId: hold,
          actualAmount: 12,
          actorUserId: user,
          description: 'Webhook media settlement',
          source: ActivitySource.VIDEO_GENERATION,
          settlementIdempotencyKey: `media-generation-settle:${hold}`,
        }),
      ]);
      await assertMoney(88, 1);
    });

    it('an old queued late debit racing operator recovery deducts once after retry', async () => {
      await reservations.release({
        organizationId: org,
        reservationId: hold,
        reason: 'expiry',
      });
      const original = balance.applyDelta.bind(balance);
      let arrivals = 0;
      let release = () => {};
      const barrier = new Promise<void>((resolve) => {
        release = resolve;
      });
      vi.spyOn(balance, 'applyDelta').mockImplementation(async (...args) => {
        arrivals += 1;
        if (arrivals === 2) release();
        if (arrivals <= 2) await barrier;
        return original(...args);
      });
      // The worker normalizes the original key-only payload to this reservation reference.
      const queued = () =>
        credits.deductCreditsFromOrganization(
          org,
          user,
          12,
          'Queued legacy late charge',
          ActivitySource.VIDEO_GENERATION,
          {
            idempotencyKey: `media-generation-late-settle:${hold}`,
            referenceId: hold,
            referenceType: 'credit_reservation',
          },
        );
      const results = await Promise.allSettled([
        act(CreditHoldRecoveryAction.CHARGE),
        queued(),
      ]);
      for (const [index, result] of results.entries()) {
        if (result.status !== 'rejected') continue;
        // PostgreSQL adapter raw updates expose serialization as P2010/40001.
        expect(['P2034', 'P2010']).toContain(result.reason.code);
        expect(result.reason.message).toMatch(
          /serialize|serialization|write conflict/i,
        );
        if (index === 0) await act(CreditHoldRecoveryAction.CHARGE);
        else await queued(); // Bull retries using the same original payload.
      }
      await assertMoney(88, 1);
      expect(
        (await database().creditReservation.findUnique({ where: { id: hold } }))
          ?.status,
      ).toBe(CreditReservationStatus.SETTLED);
    });

    it('release racing charge clears the hold exactly once and charges exactly once', async () => {
      await Promise.all([
        act(CreditHoldRecoveryAction.RELEASE),
        act(CreditHoldRecoveryAction.CHARGE),
      ]);
      await assertMoney(88, 1);
      expect(
        (await database().creditReservation.findUnique({ where: { id: hold } }))
          ?.status,
      ).toBe(CreditReservationStatus.SETTLED);
      expect(
        await database().activity.count({
          where: {
            organizationId: org,
            data: { path: ['operation'], equals: 'media-credit-hold-recovery' },
          },
        }),
      ).toBe(2);
    });

    it('audit write failure rolls back the ledger, wallet and reservation claim', async () => {
      vi.spyOn(recorder, 'recordInTransaction').mockRejectedValue(
        new Error('audit unavailable'),
      );
      await expect(act(CreditHoldRecoveryAction.CHARGE)).rejects.toThrow(
        'audit unavailable',
      );
      expect(
        await database().creditBalance.findFirst({
          where: { organizationId: org },
        }),
      ).toEqual(expect.objectContaining({ balance: 100, heldAmount: 12 }));
      expect(
        (await database().creditReservation.findUnique({ where: { id: hold } }))
          ?.status,
      ).toBe(CreditReservationStatus.RESERVED);
      expect(
        await database().creditTransaction.count({
          where: { organizationId: org },
        }),
      ).toBe(0);
      expect(
        await database().activity.count({
          where: {
            organizationId: org,
            data: { path: ['operation'], equals: 'media-credit-hold-recovery' },
          },
        }),
      ).toBe(0);
    });

    it('a prior late job with the prescribed key prevents operator replay from debiting again', async () => {
      const client = database();
      await reservations.release({
        organizationId: org,
        reservationId: hold,
        reason: 'expiry',
      });
      await client.creditBalance.updateMany({
        where: { organizationId: org },
        data: { balance: 88 },
      });
      await client.creditTransaction.create({
        data: {
          organizationId: org,
          billingAccountId: account,
          actorUserId: user,
          amount: 12,
          category: CreditTransactionCategory.DEDUCT,
          idempotencyKey: `media-generation-late-settle:${hold}`,
          balanceAfter: 88,
        },
      });
      await act(CreditHoldRecoveryAction.CHARGE);
      await assertMoney(88, 1);
    });

    it('a legacy late payload proves the ingredient payer and keeps debit and ledger balances on the original wallet after relinking', async () => {
      const client = database();
      const reservation = await client.creditReservation.findUniqueOrThrow({
        where: { id: hold },
      });
      await client.ingredient.create({
        data: {
          id: reservation.workloadId ?? '',
          userId: user,
          organizationId: org,
        },
      });
      await client.creditReservation.update({
        where: { id: hold },
        data: { actorUserId: null },
      });
      await reservations.release({
        organizationId: org,
        reservationId: hold,
        reason: 'expiry',
      });
      const relinked = `${account}-relinked`;
      await client.billingAccount.create({ data: { id: relinked } });
      await client.organization.update({
        where: { id: org },
        data: { billingAccountId: relinked },
      });
      await client.creditBalance.create({
        data: { billingAccountId: relinked, balance: 1000, heldAmount: 0 },
      });
      await credits.deductCreditsFromOrganization(
        org,
        user,
        12,
        'Legacy late media charge',
        ActivitySource.VIDEO_GENERATION,
        {
          idempotencyKey: `media-generation-late-settle:${hold}`,
          referenceId: hold,
          referenceType: 'credit_reservation',
        },
      );
      expect(
        await client.creditBalance.findFirst({
          where: { billingAccountId: account },
        }),
      ).toEqual(expect.objectContaining({ balance: 88, heldAmount: 0 }));
      expect(
        await client.creditBalance.findFirst({
          where: { billingAccountId: relinked },
        }),
      ).toEqual(expect.objectContaining({ balance: 1000, heldAmount: 0 }));
      const transaction = await client.creditTransaction.findFirstOrThrow({
        where: { organizationId: org },
      });
      expect(transaction).toEqual(
        expect.objectContaining({
          actorUserId: user,
          billingAccountId: account,
          balanceAfter: 88,
        }),
      );
      expect(transaction.metadata).toEqual(
        expect.objectContaining({ balanceBefore: 100 }),
      );
      await credits.deductCreditsFromOrganization(
        org,
        user,
        12,
        'Replay legacy late charge',
        ActivitySource.VIDEO_GENERATION,
        {
          idempotencyKey: `media-generation-late-settle:${hold}`,
          referenceId: hold,
          referenceType: 'credit_reservation',
        },
      );
      await act(CreditHoldRecoveryAction.CHARGE);
      expect(
        await client.creditTransaction.count({
          where: { organizationId: org },
        }),
      ).toBe(1);
    });

    it('metadata changed during provider lookup cannot release or debit stale proof', async () => {
      const client = database();
      const old = (
        await client.creditReservation.findUniqueOrThrow({
          where: { id: hold },
        })
      ).metadata;
      await client.creditReservation.update({
        where: { id: hold },
        data: {
          metadata: {
            assetId: 'changed-asset',
            submissionIntent: { version: 1, provider: 'heygen' },
          },
        },
      });
      await expect(
        recovery.apply({
          organizationId: org,
          reservationId: hold,
          action: CreditHoldRecoveryAction.RELEASE,
          reason: 'Stale provider snapshot',
          expectedReservationMetadata: old as Record<string, unknown>,
        }),
      ).rejects.toThrow();
      expect(
        await client.creditBalance.findFirst({
          where: { organizationId: org },
        }),
      ).toEqual(expect.objectContaining({ balance: 100, heldAmount: 12 }));
      expect(
        await client.creditTransaction.count({
          where: { organizationId: org },
        }),
      ).toBe(0);
    });
  },
);
