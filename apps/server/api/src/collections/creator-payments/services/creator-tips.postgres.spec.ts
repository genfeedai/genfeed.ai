import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { BillingAccountsService } from '@api/collections/billing-accounts/services/billing-accounts.service';
import { CreatorDirectoryService } from '@api/collections/creator-payments/services/creator-directory.service';
import { CreatorEarningsService } from '@api/collections/creator-payments/services/creator-earnings.service';
import { CreatorTipsService } from '@api/collections/creator-payments/services/creator-tips.service';
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

type Workspace = {
  billingAccountId: string;
  brandId: string;
  organizationId: string;
  userId: string;
};

describe.skipIf(!connectionString)(
  'creator tips (PostgreSQL, CLOUD tenant guard)',
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
    let tips: CreatorTipsService;
    let earnings: CreatorEarningsService;

    function workspace(role: string): Workspace {
      return {
        billingAccountId: `tip-${role}-billing-${suffix}`,
        brandId: `tip-${role}-brand-${suffix}`,
        organizationId: `tip-${role}-org-${suffix}`,
        userId: `tip-${role}-user-${suffix}`,
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
      handle = `tip-creator-${suffix}`;
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
      tips = new CreatorTipsService(
        prisma,
        new CreatorDirectoryService(prisma),
        transfers,
      );
      earnings = new CreatorEarningsService(prisma);
      await seedWorkspace(reader, {
        balance: 200,
        brandScope: AssetScope.USER,
        slug: `tip-reader-${suffix}`,
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
      await db.member.deleteMany({ where: scoped });
      await db.role.deleteMany({ where: { key: `tip-role-${suffix}` } });
      await db.article.deleteMany({ where: scoped });
      await db.creditTransaction.deleteMany({ where: scoped });
      await db.creditBalance.deleteMany({ where: scoped });
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

    it('sends a tip from an article page: the reader pays, the creator earns and sees the note', async () => {
      const article = await database().article.create({
        data: {
          brandId: creator.brandId,
          label: 'How I plan a week of posts',
          organizationId: creator.organizationId,
          status: ArticleStatus.PUBLISHED,
          userId: creator.userId,
        },
      });

      const result = await asReader(() =>
        tips.tip(
          { organizationId: reader.organizationId, userId: reader.userId },
          {
            amount: 50,
            articleId: article.id,
            handle: `@${handle}`,
            idempotencyKey: 'click-1',
            message: 'This saved me hours',
          },
        ),
      );

      expect(result).toMatchObject({
        amount: 50,
        balanceAfter: 150,
        creatorLabel: `Brand ${creator.brandId}`,
        wasApplied: true,
      });
      expect(await wallet(reader)).toEqual({ balance: 150, earnedBalance: 0 });
      expect(await wallet(creator)).toEqual({ balance: 50, earnedBalance: 50 });
      const received = await database().creditTransaction.findFirstOrThrow({
        where: {
          category: CreditTransactionCategory.TRANSFER_IN,
          organizationId: creator.organizationId,
        },
      });
      expect(received).toMatchObject({
        brandId: creator.brandId,
        description: 'Tip from Ada on "How I plan a week of posts"',
        source: 'tip',
      });
      expect(received.metadata).toMatchObject({
        message: 'This saved me hours',
        subjectId: article.id,
      });
    });

    it('shows the tip page target, and refuses tips to a workspace the reader belongs to', async () => {
      await expect(
        asReader(() =>
          tips.getTarget(
            { organizationId: reader.organizationId, userId: reader.userId },
            handle,
          ),
        ),
      ).resolves.toEqual({
        brandId: creator.brandId,
        handle,
        isTippable: true,
        label: `Brand ${creator.brandId}`,
      });

      const role = await database().role.create({
        data: { key: `tip-role-${suffix}`, label: 'Member' },
      });
      await database().member.create({
        data: {
          currentBrandId: creator.brandId,
          organizationId: creator.organizationId,
          roleId: role.id,
          userId: reader.userId,
        },
      });

      await expect(
        asReader(() =>
          tips.tip(
            { organizationId: reader.organizationId, userId: reader.userId },
            { amount: 10, handle, idempotencyKey: 'click-team' },
          ),
        ),
      ).rejects.toThrow(
        'You cannot tip a creator whose workspace you belong to',
      );
      expect(await wallet(reader)).toEqual({ balance: 200, earnedBalance: 0 });
    });

    it('shows the creator what they earned and the reader what they paid, from the ledger rows', async () => {
      const article = await database().article.create({
        data: {
          brandId: creator.brandId,
          label: 'How I plan a week of posts',
          organizationId: creator.organizationId,
          status: ArticleStatus.PUBLISHED,
          userId: creator.userId,
        },
      });
      const sendTip = (amount: number, key: string, articleId?: string) =>
        asReader(() =>
          tips.tip(
            { organizationId: reader.organizationId, userId: reader.userId },
            {
              amount,
              ...(articleId ? { articleId } : {}),
              handle,
              idempotencyKey: key,
              ...(articleId ? {} : { message: 'Keep going' }),
            },
          ),
        );
      await sendTip(30, 'earn-1', article.id);
      await sendTip(20, 'earn-2', article.id);
      await sendTip(15, 'earn-3');

      const creatorView = await runWithTenantContext(
        { organizationId: creator.organizationId },
        () => earnings.getEarnings(creator.organizationId),
      );
      expect(creatorView).toMatchObject({
        byArticle: [
          {
            articleId: article.id,
            count: 2,
            label: 'How I plan a week of posts',
            netAmount: 50,
          },
        ],
        bySource: [
          { count: 3, kind: 'tip', netAmount: 65 },
          { count: 0, kind: 'subscription', netAmount: 0 },
          { count: 0, kind: 'unlock', netAmount: 0 },
        ],
        earnedBalance: 65,
        sent: [],
        thisMonth: 65,
        totalEarned: 65,
      });
      expect(
        creatorView.received.map(
          ({ description, feeAmount, grossAmount, message, netAmount }) => ({
            description,
            feeAmount,
            grossAmount,
            message,
            netAmount,
          }),
        ),
      ).toEqual([
        {
          description: 'Tip from Ada',
          feeAmount: 0,
          grossAmount: 15,
          message: 'Keep going',
          netAmount: 15,
        },
        {
          description: 'Tip from Ada on "How I plan a week of posts"',
          feeAmount: 0,
          grossAmount: 20,
          message: undefined,
          netAmount: 20,
        },
        {
          description: 'Tip from Ada on "How I plan a week of posts"',
          feeAmount: 0,
          grossAmount: 30,
          message: undefined,
          netAmount: 30,
        },
      ]);
      expect(await wallet(creator)).toEqual({ balance: 65, earnedBalance: 65 });

      const readerView = await asReader(() =>
        earnings.getEarnings(reader.organizationId),
      );
      expect(readerView).toMatchObject({
        byArticle: [],
        earnedBalance: 0,
        received: [],
        totalEarned: 0,
      });
      expect(readerView.sent.map((row) => row.description)).toEqual([
        `Tip to Brand ${creator.brandId}`,
        `Tip to Brand ${creator.brandId} on "How I plan a week of posts"`,
        `Tip to Brand ${creator.brandId} on "How I plan a week of posts"`,
      ]);
    });

    it('cannot reach a brand that is not public', async () => {
      await expect(
        asReader(() =>
          tips.tip(
            { organizationId: reader.organizationId, userId: reader.userId },
            {
              amount: 10,
              handle: `tip-reader-${suffix}`,
              idempotencyKey: 'click-private',
            },
          ),
        ),
      ).rejects.toThrow('Creator not found');
    });
  },
);
