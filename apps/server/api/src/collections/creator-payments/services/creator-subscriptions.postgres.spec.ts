import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { BillingAccountsService } from '@api/collections/billing-accounts/services/billing-accounts.service';
import { CreatorDirectoryService } from '@api/collections/creator-payments/services/creator-directory.service';
import {
  type CreatorSubscriptionRenewalTotals,
  CreatorSubscriptionsService,
} from '@api/collections/creator-payments/services/creator-subscriptions.service';
import { CreditBalanceService } from '@api/collections/credits/services/credit-balance.service';
import { CreditTransactionsService } from '@api/collections/credits/services/credit-transactions.service';
import { CreditTransfersService } from '@api/collections/credits/services/credit-transfers.service';
import { NewsletterRecipientAccessService } from '@api/collections/newsletter-sends/services/newsletter-recipient-access.service';
import type { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import type { CacheInvalidationService } from '@api/common/services/cache-invalidation.service';
import { TransactionUtil } from '@api/helpers/utils/transaction/transaction.util';
import type { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ActivitySource,
  CreditTransactionCategory,
} from '@genfeedai/contracts';
import type { NewsletterAccessLevel } from '@genfeedai/contracts/constants';
import {
  AssetScope,
  CreatorSubscriptionStatus,
  PrismaClient,
} from '@genfeedai/prisma';
import type { LoggerService } from '@libs/logger/logger.service';
import {
  discoverBillingAccountModelNames,
  discoverTenantModels,
} from '@libs/prisma/discover-tenant-models';
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

// Explicit opt-in only: an isolated migrated database, never DATABASE_URL.
const connectionString = process.env.BILLING_ACCOUNT_SCOPE_TEST_DATABASE_URL;
const schema = readFileSync(
  path.resolve(
    __dirname,
    '../../../../../../../packages/prisma/prisma/schema.prisma',
  ),
  'utf8',
);

type Workspace = {
  billingAccountId: string;
  brandId: string;
  organizationId: string;
  userId: string;
};

describe.skipIf(!connectionString)(
  'paid creator subscriptions (PostgreSQL, CLOUD tenant guard)',
  () => {
    const client = connectionString
      ? new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
      : null;
    const database = () => {
      if (!client) throw new Error('A test database URL is required');
      return client;
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
    let handle: string;
    let subscriptions: CreatorSubscriptionsService;
    let guardedPrisma: PrismaService;

    function workspace(role: string): Workspace {
      return {
        billingAccountId: `sub-${role}-billing-${suffix}`,
        brandId: `sub-${role}-brand-${suffix}`,
        organizationId: `sub-${role}-org-${suffix}`,
        userId: `sub-${role}-user-${suffix}`,
      };
    }

    async function seedWorkspace(
      owner: Workspace,
      options: { balance: number; brandScope: AssetScope; slug: string },
    ): Promise<void> {
      const db = database();
      await db.user.create({
        data: { firstName: 'Ada', handle: owner.userId, id: owner.userId },
      });
      await db.billingAccount.create({ data: { id: owner.billingAccountId } });
      await db.organization.create({
        data: {
          billingAccountId: owner.billingAccountId,
          id: owner.organizationId,
          label: owner.organizationId,
          slug: owner.organizationId,
          userId: owner.userId,
        },
      });
      await db.brand.create({
        data: {
          id: owner.brandId,
          label: `Brand ${owner.brandId}`,
          organizationId: owner.organizationId,
          scope: options.brandScope,
          slug: options.slug,
          userId: owner.userId,
        },
      });
      await db.creditBalance.create({
        data: {
          balance: options.balance,
          billingAccountId: owner.billingAccountId,
          organizationId: owner.organizationId,
        },
      });
      await db.creditTransaction.create({
        data: {
          amount: options.balance,
          balanceAfter: options.balance,
          billingAccountId: owner.billingAccountId,
          category: CreditTransactionCategory.ADD,
          organizationId: owner.organizationId,
          source: ActivitySource.PAY_AS_YOU_GO,
        },
      });
    }

    const wallet = (owner: Workspace) =>
      database().creditBalance.findFirstOrThrow({
        select: { balance: true, earnedBalance: true },
        where: { isDeleted: false, organizationId: owner.organizationId },
      });

    /** Runs as the signed-in reader's request does: inside its tenant context. */
    const asReader = <T>(work: () => Promise<T>) =>
      runWithTenantContext({ organizationId: reader.organizationId }, work);

    beforeEach(async () => {
      vi.stubEnv('GENFEED_CLOUD', '1');
      suffix = randomUUID();
      reader = workspace('reader');
      creator = workspace('creator');
      handle = `sub-creator-${suffix}`;
      const prisma = database().$extends(
        createTenantGuardExtension({
          billingAccountModelNames: discoverBillingAccountModelNames(schema),
          isCloud: true,
          tenantModelNames: new Set(
            discoverTenantModels(schema).map(({ model }) => model),
          ),
        }),
      ) as unknown as PrismaService;
      guardedPrisma = prisma;
      const balance = new CreditBalanceService(prisma, logger);
      const ledger = new CreditTransactionsService(prisma, logger, balance, {
        invalidate: vi.fn().mockResolvedValue(undefined),
      } as unknown as CacheInvalidationService);
      const transfers = new CreditTransfersService(
        new BillingAccountsService(prisma, logger),
        balance,
        ledger,
        new TransactionUtil(prisma, logger),
        {
          emit: vi.fn().mockResolvedValue(undefined),
        } as unknown as NotificationsPublisherService,
        {
          invalidateForOrganization: vi.fn().mockResolvedValue(undefined),
        } as unknown as AccessBootstrapCacheService,
        logger,
      );
      subscriptions = new CreatorSubscriptionsService(
        prisma,
        new CreatorDirectoryService(prisma),
        transfers,
        logger,
      );
      await seedWorkspace(reader, {
        balance: 200,
        brandScope: AssetScope.USER,
        slug: `sub-reader-${suffix}`,
      });
      await seedWorkspace(creator, {
        balance: 0,
        brandScope: AssetScope.PUBLIC,
        slug: handle,
      });
    });

    afterEach(async () => {
      vi.unstubAllEnvs();
      const db = database();
      const organizationIds = [reader.organizationId, creator.organizationId];
      const scoped = { organizationId: { in: organizationIds } };
      await db.activity.deleteMany({ where: scoped });
      await db.creatorSubscription.deleteMany({ where: scoped });
      await db.creatorSubscriptionPlan.deleteMany({ where: scoped });
      await db.creditTransaction.deleteMany({ where: scoped });
      await db.creditBalance.deleteMany({ where: scoped });
      await db.brandSubscriber.deleteMany({ where: scoped });
      await db.brand.deleteMany({ where: scoped });
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
      await client?.$disconnect();
    });

    const asCreator = <T>(work: () => Promise<T>) =>
      runWithTenantContext({ organizationId: creator.organizationId }, work);
    const readerContext = () => ({
      organizationId: reader.organizationId,
      userId: reader.userId,
    });
    const DAY_MS = 24 * 60 * 60 * 1000;
    const emptyTotals = (): CreatorSubscriptionRenewalTotals => ({
      charged: 0,
      ended: 0,
      failed: 0,
      'past-due': 0,
      unchanged: 0,
    });
    /** Runs the renewal job for the creator organization at a given moment. */
    async function renewAt(
      now: Date,
    ): Promise<CreatorSubscriptionRenewalTotals> {
      const totals = emptyTotals();
      const due = await subscriptions.findRenewalOrganizations(
        now,
        undefined,
        100,
      );
      for (const organizationId of due.filter(
        (id) => id === creator.organizationId,
      )) {
        await subscriptions.renewOrganization(organizationId, now, totals);
      }
      return totals;
    }
    const hasAccess = () =>
      subscriptions.hasActivePaidSubscription(
        creator.organizationId,
        creator.brandId,
        reader.userId,
      );
    const subscriptionRow = () =>
      database().creatorSubscription.findFirstOrThrow({
        select: {
          currentPeriodEnd: true,
          currentPeriodStart: true,
          pastDueSince: true,
          status: true,
        },
        where: { organizationId: creator.organizationId },
      });

    async function offerPlan(monthlyPriceCredits: number): Promise<void> {
      await asCreator(() =>
        subscriptions.updatePlan(creator.organizationId, creator.brandId, {
          isEnabled: true,
          monthlyPriceCredits,
        }),
      );
    }

    it('charges the first month on subscribe and the next one at renewal', async () => {
      await offerPlan(40);
      const start = new Date('2026-11-09T10:00:00.000Z');

      const subscribed = await asReader(() =>
        subscriptions.subscribe(
          readerContext(),
          { handle, idempotencyKey: 'sub-1' },
          start,
        ),
      );
      expect(subscribed).toMatchObject({
        cancelAtPeriodEnd: false,
        currentPeriodEnd: '2026-12-09T10:00:00.000Z',
        priceCredits: 40,
        status: CreatorSubscriptionStatus.ACTIVE,
      });
      // Retrying the click charges nothing more.
      await asReader(() =>
        subscriptions.subscribe(
          readerContext(),
          { handle, idempotencyKey: 'sub-1' },
          start,
        ),
      );
      expect(await wallet(reader)).toEqual({ balance: 160, earnedBalance: 0 });
      expect(await wallet(creator)).toEqual({ balance: 40, earnedBalance: 40 });
      expect(await hasAccess()).toBe(true);

      // Nothing is due before the period ends.
      expect(
        (await renewAt(new Date('2026-12-09T09:59:00.000Z'))).charged,
      ).toBe(0);
      expect(await renewAt(new Date('2026-12-09T10:05:00.000Z'))).toMatchObject(
        { charged: 1, failed: 0 },
      );
      // A second tick for the same period changes nothing.
      expect(await renewAt(new Date('2026-12-09T10:20:00.000Z'))).toMatchObject(
        { charged: 0, failed: 0 },
      );

      expect(await subscriptionRow()).toEqual({
        currentPeriodEnd: new Date('2027-01-09T10:00:00.000Z'),
        currentPeriodStart: new Date('2026-12-09T10:00:00.000Z'),
        pastDueSince: null,
        status: CreatorSubscriptionStatus.ACTIVE,
      });
      expect(await wallet(reader)).toEqual({ balance: 120, earnedBalance: 0 });
      expect(await wallet(creator)).toEqual({ balance: 80, earnedBalance: 80 });

      const mine = await asReader(() =>
        subscriptions.listMine(readerContext()),
      );
      expect(mine).toEqual([
        expect.objectContaining({
          creatorHandle: handle,
          priceCredits: 40,
          status: CreatorSubscriptionStatus.ACTIVE,
        }),
      ]);
      const plans = await asCreator(() =>
        subscriptions.listPlans(creator.organizationId),
      );
      expect(plans).toEqual([
        expect.objectContaining({
          activeSubscribers: 1,
          brandId: creator.brandId,
          isEnabled: true,
          monthlyPriceCredits: 40,
        }),
      ]);
    });

    it('keeps access until the paid period ends after a cancel, then ends without charging', async () => {
      await offerPlan(40);
      const start = new Date('2026-11-09T10:00:00.000Z');
      const subscribed = await asReader(() =>
        subscriptions.subscribe(
          readerContext(),
          { handle, idempotencyKey: 'sub-cancel' },
          start,
        ),
      );

      const cancelled = await asReader(() =>
        subscriptions.setCancelAtPeriodEnd(
          readerContext(),
          subscribed.id,
          true,
        ),
      );
      expect(cancelled.cancelAtPeriodEnd).toBe(true);
      expect(await hasAccess()).toBe(true);

      expect(await renewAt(new Date('2026-12-09T10:05:00.000Z'))).toMatchObject(
        { charged: 0, ended: 1 },
      );
      expect((await subscriptionRow()).status).toBe(
        CreatorSubscriptionStatus.ENDED,
      );
      expect(await hasAccess()).toBe(false);
      expect(await wallet(reader)).toEqual({ balance: 160, earnedBalance: 0 });

      // Replaying the first charge's key returns the ended subscription and
      // opens nothing; only a new charge subscribes again.
      const replayed = await asReader(() =>
        subscriptions.subscribe(
          readerContext(),
          { handle, idempotencyKey: 'sub-cancel' },
          new Date('2026-12-10T10:00:00.000Z'),
        ),
      );
      expect(replayed).toMatchObject({
        id: subscribed.id,
        status: CreatorSubscriptionStatus.ENDED,
      });
      expect(await hasAccess()).toBe(false);
      expect(await wallet(reader)).toEqual({ balance: 160, earnedBalance: 0 });

      const resubscribed = await asReader(() =>
        subscriptions.subscribe(
          readerContext(),
          { handle, idempotencyKey: 'sub-again' },
          new Date('2026-12-10T10:00:00.000Z'),
        ),
      );
      expect(resubscribed.status).toBe(CreatorSubscriptionStatus.ACTIVE);
      expect(await hasAccess()).toBe(true);
      expect(await wallet(reader)).toEqual({ balance: 120, earnedBalance: 0 });
    });

    it('ends without charging once the reader no longer belongs to the paying workspace', async () => {
      await offerPlan(40);
      await asReader(() =>
        subscriptions.subscribe(
          readerContext(),
          { handle, idempotencyKey: 'sub-left' },
          new Date('2026-11-09T10:00:00.000Z'),
        ),
      );
      // The reader hands the workspace over and keeps no membership in it.
      await database().organization.update({
        data: { userId: creator.userId },
        where: { id: reader.organizationId },
      });

      expect(await renewAt(new Date('2026-12-09T10:05:00.000Z'))).toMatchObject(
        { charged: 0, ended: 1 },
      );
      expect(await hasAccess()).toBe(false);
      expect(await wallet(reader)).toEqual({ balance: 160, earnedBalance: 0 });
    });

    it('marks a reader who cannot pay as past due, then ends it after the grace period', async () => {
      await offerPlan(150);
      const start = new Date('2026-11-09T10:00:00.000Z');
      await asReader(() =>
        subscriptions.subscribe(
          readerContext(),
          { handle, idempotencyKey: 'sub-broke' },
          start,
        ),
      );
      // 200 - 150 leaves 50: the next 150 cannot be paid.
      expect(await wallet(reader)).toEqual({ balance: 50, earnedBalance: 0 });

      const periodEnd = new Date('2026-12-09T10:00:00.000Z');
      const failedAt = new Date(periodEnd.getTime() + 5 * 60 * 1000);
      expect(await renewAt(failedAt)).toMatchObject({ 'past-due': 1 });
      expect(await subscriptionRow()).toMatchObject({
        pastDueSince: failedAt,
        status: CreatorSubscriptionStatus.PAST_DUE,
      });
      // Grace period: still readable, still retried, still past due.
      expect(await hasAccess()).toBe(true);
      expect(
        await renewAt(new Date(failedAt.getTime() + DAY_MS)),
      ).toMatchObject({ unchanged: 1 });

      expect(
        await renewAt(new Date(failedAt.getTime() + 3 * DAY_MS)),
      ).toMatchObject({ ended: 1 });
      expect((await subscriptionRow()).status).toBe(
        CreatorSubscriptionStatus.ENDED,
      );
      expect(await hasAccess()).toBe(false);
      expect(await wallet(reader)).toEqual({ balance: 50, earnedBalance: 0 });
      expect(await wallet(creator)).toEqual({
        balance: 150,
        earnedBalance: 150,
      });
    });

    it('sends a paid newsletter issue in full only to an email subscriber with a live paid subscription', async () => {
      await offerPlan(40);
      await asReader(() =>
        subscriptions.subscribe(readerContext(), {
          handle,
          idempotencyKey: 'sub-newsletter',
        }),
      );
      const db = database();
      const member = await db.brandSubscriber.create({
        data: {
          brandId: creator.brandId,
          email: `reader-${suffix}@example.test`,
          emailHash: `reader-hash-${suffix}`,
          organizationId: creator.organizationId,
          status: 'active',
          userId: reader.userId,
        },
      });
      const emailOnly = await db.brandSubscriber.create({
        data: {
          brandId: creator.brandId,
          email: `email-only-${suffix}@example.test`,
          emailHash: `email-only-hash-${suffix}`,
          organizationId: creator.organizationId,
          status: 'active',
        },
      });
      const access = new NewsletterRecipientAccessService(
        guardedPrisma,
        subscriptions,
      );
      const issue = (accessLevel: NewsletterAccessLevel) => ({
        accessLevel,
        brandId: creator.brandId,
      });
      const subscriber = (id: string) => ({
        id,
        organizationId: creator.organizationId,
      });

      expect(
        await asCreator(() =>
          access.hasFullAccess(subscriber(member.id), issue('paid')),
        ),
      ).toBe(true);
      expect(
        await asCreator(() =>
          access.hasFullAccess(subscriber(emailOnly.id), issue('paid')),
        ),
      ).toBe(false);
      expect(
        await asCreator(() =>
          access.hasFullAccess(subscriber(emailOnly.id), issue('subscribers')),
        ),
      ).toBe(true);
    });

    it('refuses creators without a plan', async () => {
      await expect(
        asReader(() =>
          subscriptions.subscribe(readerContext(), {
            handle,
            idempotencyKey: 'sub-none',
          }),
        ),
      ).rejects.toThrow('This creator does not offer a paid subscription');
      expect(
        await asReader(() => subscriptions.getOffer(readerContext(), handle)),
      ).toEqual({ monthlyPriceCredits: null, subscription: null });
    });
  },
);
