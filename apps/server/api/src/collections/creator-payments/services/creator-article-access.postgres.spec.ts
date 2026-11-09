import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { BillingAccountsService } from '@api/collections/billing-accounts/services/billing-accounts.service';
import { CreatorArticleAccessService } from '@api/collections/creator-payments/services/creator-article-access.service';
import { CreatorDirectoryService } from '@api/collections/creator-payments/services/creator-directory.service';
import { CreatorSubscriptionsService } from '@api/collections/creator-payments/services/creator-subscriptions.service';
import { CreditBalanceService } from '@api/collections/credits/services/credit-balance.service';
import { CreditTransactionsService } from '@api/collections/credits/services/credit-transactions.service';
import { CreditTransfersService } from '@api/collections/credits/services/credit-transfers.service';
import type { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import type { CacheInvalidationService } from '@api/common/services/cache-invalidation.service';
import { TransactionUtil } from '@api/helpers/utils/transaction/transaction.util';
import type { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ActivitySource,
  CreditTransactionCategory,
} from '@genfeedai/contracts';
import { ArticleStatus, AssetScope, PrismaClient } from '@genfeedai/prisma';
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

const FULL_BODY = '<p>Free opening.</p><p>Second part.</p><p>Paid ending.</p>';

type Workspace = {
  billingAccountId: string;
  brandId: string;
  organizationId: string;
  userId: string;
};

describe.skipIf(!connectionString)(
  'paid articles (PostgreSQL, CLOUD tenant guard)',
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
    let access: CreatorArticleAccessService;

    function workspace(role: string): Workspace {
      return {
        billingAccountId: `unlock-${role}-billing-${suffix}`,
        brandId: `unlock-${role}-brand-${suffix}`,
        organizationId: `unlock-${role}-org-${suffix}`,
        userId: `unlock-${role}-user-${suffix}`,
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
    const asCreator = <T>(work: () => Promise<T>) =>
      runWithTenantContext({ organizationId: creator.organizationId }, work);
    const readerContext = () => ({
      organizationId: reader.organizationId,
      userId: reader.userId,
    });
    /** A second workspace the same reader owns, with its own wallet. */
    const secondWorkspace = () => ({
      billingAccountId: `unlock-second-billing-${suffix}`,
      organizationId: `unlock-second-org-${suffix}`,
    });

    async function seedSecondWorkspace(balance: number): Promise<void> {
      const db = database();
      const second = secondWorkspace();
      await db.billingAccount.create({ data: { id: second.billingAccountId } });
      await db.organization.create({
        data: {
          billingAccountId: second.billingAccountId,
          id: second.organizationId,
          label: second.organizationId,
          slug: second.organizationId,
          userId: reader.userId,
        },
      });
      await db.creditBalance.create({
        data: {
          balance,
          billingAccountId: second.billingAccountId,
          organizationId: second.organizationId,
        },
      });
      await db.creditTransaction.create({
        data: {
          amount: balance,
          balanceAfter: balance,
          billingAccountId: second.billingAccountId,
          category: CreditTransactionCategory.ADD,
          organizationId: second.organizationId,
          source: ActivitySource.PAY_AS_YOU_GO,
        },
      });
    }

    const secondWallet = () =>
      database().creditBalance.findFirstOrThrow({
        select: { balance: true },
        where: {
          isDeleted: false,
          organizationId: secondWorkspace().organizationId,
        },
      });

    async function publishArticle(options: {
      accessLevel: string;
      status?: ArticleStatus;
      unlockPriceCredits: number | null;
    }): Promise<string> {
      const id = `unlock-article-${randomUUID()}`;
      await database().article.create({
        data: {
          accessLevel: options.accessLevel,
          brandId: creator.brandId,
          content: FULL_BODY,
          id,
          label: 'Launch notes',
          organizationId: creator.organizationId,
          publishedAt: new Date('2026-11-01T00:00:00.000Z'),
          slug: id,
          status: options.status ?? ArticleStatus.PUBLISHED,
          unlockPriceCredits: options.unlockPriceCredits,
          userId: creator.userId,
        },
      });
      return id;
    }

    beforeEach(async () => {
      vi.stubEnv('GENFEED_CLOUD', '1');
      suffix = randomUUID();
      reader = workspace('reader');
      creator = workspace('creator');
      handle = `unlock-creator-${suffix}`;
      const prisma = database().$extends(
        createTenantGuardExtension({
          billingAccountModelNames: discoverBillingAccountModelNames(schema),
          isCloud: true,
          tenantModelNames: new Set(
            discoverTenantModels(schema).map(({ model }) => model),
          ),
        }),
      ) as unknown as PrismaService;
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
      const directory = new CreatorDirectoryService(prisma);
      subscriptions = new CreatorSubscriptionsService(
        prisma,
        directory,
        transfers,
        logger,
      );
      access = new CreatorArticleAccessService(
        prisma,
        directory,
        subscriptions,
        transfers,
      );
      await seedWorkspace(reader, {
        balance: 200,
        brandScope: AssetScope.USER,
        slug: `unlock-reader-${suffix}`,
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
      const organizationIds = [
        reader.organizationId,
        creator.organizationId,
        secondWorkspace().organizationId,
      ];
      const scoped = { organizationId: { in: organizationIds } };
      await db.activity.deleteMany({ where: scoped });
      await db.articleUnlock.deleteMany({ where: scoped });
      await db.article.deleteMany({ where: scoped });
      await db.creatorSubscription.deleteMany({ where: scoped });
      await db.creatorSubscriptionPlan.deleteMany({ where: scoped });
      await db.creditTransaction.deleteMany({ where: scoped });
      await db.creditBalance.deleteMany({ where: scoped });
      await db.brand.deleteMany({ where: scoped });
      await db.organization.deleteMany({
        where: { id: { in: organizationIds } },
      });
      await db.billingAccount.deleteMany({
        where: {
          id: {
            in: [
              reader.billingAccountId,
              creator.billingAccountId,
              secondWorkspace().billingAccountId,
            ],
          },
        },
      });
      await db.user.deleteMany({
        where: { id: { in: [reader.userId, creator.userId] } },
      });
    });

    afterAll(async () => {
      await client?.$disconnect();
    });

    it('withholds a paid article until the reader unlocks it, and charges once', async () => {
      const articleId = await publishArticle({
        accessLevel: 'paid',
        unlockPriceCredits: 25,
      });

      expect(
        await asReader(() => access.getAccess(readerContext(), articleId)),
      ).toMatchObject({
        content: null,
        hasAccess: false,
        reason: null,
        unlockPriceCredits: 25,
      });

      const unlocked = await asReader(() =>
        access.unlock(readerContext(), articleId),
      );
      expect(unlocked).toMatchObject({
        access: { content: FULL_BODY, hasAccess: true, reason: 'unlocked' },
        wasApplied: true,
      });
      // A second click, or a retry after a lost response, charges nothing.
      expect(
        await asReader(() => access.unlock(readerContext(), articleId)),
      ).toMatchObject({ transferId: null, wasApplied: false });

      expect(await wallet(reader)).toEqual({ balance: 175, earnedBalance: 0 });
      expect(await wallet(creator)).toEqual({ balance: 25, earnedBalance: 25 });
      expect(
        await asReader(() => access.getAccess(readerContext(), articleId)),
      ).toMatchObject({ content: FULL_BODY, reason: 'unlocked' });
    });

    it('charges one workspace when the reader unlocks from two at once', async () => {
      const articleId = await publishArticle({
        accessLevel: 'paid',
        unlockPriceCredits: 25,
      });
      await seedSecondWorkspace(200);
      const second = secondWorkspace();

      await Promise.allSettled([
        asReader(() => access.unlock(readerContext(), articleId)),
        runWithTenantContext({ organizationId: second.organizationId }, () =>
          access.unlock(
            { organizationId: second.organizationId, userId: reader.userId },
            articleId,
          ),
        ),
      ]);

      expect(
        (await wallet(reader)).balance + (await secondWallet()).balance,
      ).toBe(375);
      expect(await wallet(creator)).toEqual({ balance: 25, earnedBalance: 25 });
      expect(
        await asReader(() => access.getAccess(readerContext(), articleId)),
      ).toMatchObject({ content: FULL_BODY, reason: 'unlocked' });
    });

    it('lets a paying subscriber read without unlocking', async () => {
      const articleId = await publishArticle({
        accessLevel: 'paid',
        unlockPriceCredits: null,
      });
      await asCreator(() =>
        subscriptions.updatePlan(creator.organizationId, creator.brandId, {
          isEnabled: true,
          monthlyPriceCredits: 40,
        }),
      );

      await expect(
        asReader(() => access.unlock(readerContext(), articleId)),
      ).rejects.toMatchObject({ errorCode: 'ARTICLE_NOT_UNLOCKABLE' });

      await asReader(() =>
        subscriptions.subscribe(readerContext(), {
          handle,
        }),
      );
      expect(
        await asReader(() => access.getAccess(readerContext(), articleId)),
      ).toMatchObject({
        content: FULL_BODY,
        reason: 'subscriber',
        subscriptionPriceCredits: 40,
      });
      // Only the subscription was charged.
      expect(await wallet(reader)).toEqual({ balance: 160, earnedBalance: 0 });
    });

    it('shows the creator team the full article for free', async () => {
      const articleId = await publishArticle({
        accessLevel: 'paid',
        unlockPriceCredits: 25,
      });

      expect(
        await asCreator(() =>
          access.getAccess(
            { organizationId: creator.organizationId, userId: creator.userId },
            articleId,
          ),
        ),
      ).toMatchObject({ content: FULL_BODY, reason: 'team' });
    });

    it('finds no unpublished article', async () => {
      const articleId = await publishArticle({
        accessLevel: 'paid',
        status: ArticleStatus.DRAFT,
        unlockPriceCredits: 25,
      });

      await expect(
        asReader(() => access.getAccess(readerContext(), articleId)),
      ).rejects.toThrow('Article');
    });
  },
);
