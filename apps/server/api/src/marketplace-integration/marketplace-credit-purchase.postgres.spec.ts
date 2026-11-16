import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { BetterAuthService } from '@api/auth/better-auth/better-auth.service';
import { BillingAccountsService } from '@api/collections/billing-accounts/services/billing-accounts.service';
import { CreditBalanceService } from '@api/collections/credits/services/credit-balance.service';
import type { CreditReservationService } from '@api/collections/credits/services/credit-reservation.service';
import { CreditTransactionsService } from '@api/collections/credits/services/credit-transactions.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { FreeTrialService } from '@api/collections/credits/services/free-trial.service';
import type { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import type { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import type { CacheInvalidationService } from '@api/common/services/cache-invalidation.service';
import { TransactionUtil } from '@api/helpers/utils/transaction/transaction.util';
import type {
  MarketplaceApiClient,
  MarketplaceCreditPurchaseInput,
  MarketplaceCreditPurchaseResult,
  MarketplaceCreditQuoteResult,
  MarketplaceCreditRefundResult,
} from '@api/marketplace-integration/marketplace-api-client';
import { MarketplaceCreditPurchaseService } from '@api/marketplace-integration/marketplace-credit-purchase.service';
import type { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ActivitySource,
  CreditTransactionCategory,
} from '@genfeedai/contracts';
import { PrismaClient } from '@genfeedai/prisma';
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
    '../../../../../packages/prisma/prisma/schema.prisma',
  ),
  'utf8',
);

const LISTING_ID = 'listing-workflow-1';
const GEN_PRICE = 2175;

/**
 * Stands in for the marketplace service. It states the GEN price itself and
 * keeps one purchase per call key, as the real service route does, so the
 * tests can break it on purpose: refuse, go silent, or lose the refund call.
 */
class FakeMarketplace {
  purchases = new Map<
    string,
    MarketplaceCreditPurchaseInput & { id: string }
  >();
  recordCalls = 0;
  quote: MarketplaceCreditQuoteResult = {
    creditPrice: GEN_PRICE,
    status: 'ok',
  };
  recordMode: 'ok' | 'reject-409' | 'down' = 'ok';
  /** A down marketplace still stores the purchase when it answers late. */
  storeWhenDown = false;
  refundMode: 'ok' | 'down' = 'ok';

  asClient(): MarketplaceApiClient {
    return {
      getCreditQuote: async () => this.quote,
      recordCreditPurchase: async (
        input: MarketplaceCreditPurchaseInput,
      ): Promise<MarketplaceCreditPurchaseResult> => {
        this.recordCalls += 1;
        if (this.recordMode === 'reject-409') {
          return {
            httpStatus: 409,
            reason: 'This buyer already owns this item',
            status: 'rejected',
          };
        }
        const existing = this.purchases.get(input.idempotencyKey);
        if (this.recordMode === 'down') {
          if (this.storeWhenDown && !existing) {
            this.purchases.set(input.idempotencyKey, {
              ...input,
              id: `purchase-${this.purchases.size + 1}`,
            });
          }
          return { status: 'unavailable' };
        }
        const purchase = existing ?? {
          ...input,
          id: `purchase-${this.purchases.size + 1}`,
        };
        this.purchases.set(input.idempotencyKey, purchase);
        return { purchaseId: purchase.id, status: 'recorded' };
      },
      refundCreditPurchase: async (
        idempotencyKey: string,
      ): Promise<MarketplaceCreditRefundResult> => {
        if (this.refundMode === 'down') return { status: 'unavailable' };
        if (!this.purchases.delete(idempotencyKey)) return { status: 'absent' };
        return { status: 'refunded' };
      },
    } as unknown as MarketplaceApiClient;
  }
}

describe.skipIf(!connectionString)(
  'paying for a marketplace listing with credits (PostgreSQL, CLOUD tenant guard)',
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
    let organizationId: string;
    let billingAccountId: string;
    let userId: string;
    let marketplace: FakeMarketplace;
    let service: MarketplaceCreditPurchaseService;

    async function seedWallet(balance: number): Promise<void> {
      const db = database();
      await db.user.create({
        data: { firstName: 'Ada', handle: userId, id: userId },
      });
      await db.billingAccount.create({ data: { id: billingAccountId } });
      await db.organization.create({
        data: {
          billingAccountId,
          id: organizationId,
          label: organizationId,
          slug: organizationId,
          userId,
        },
      });
      await db.creditBalance.create({
        data: { balance, billingAccountId, organizationId },
      });
      await db.creditTransaction.create({
        data: {
          amount: balance,
          balanceAfter: balance,
          billingAccountId,
          category: CreditTransactionCategory.ADD,
          organizationId,
          source: ActivitySource.PAY_AS_YOU_GO,
        },
      });
    }

    const balance = async () =>
      (
        await database().creditBalance.findFirstOrThrow({
          select: { balance: true },
          where: { isDeleted: false, organizationId },
        })
      ).balance;

    const ledger = async () =>
      (
        await database().creditTransaction.findMany({
          orderBy: { createdAt: 'asc' },
          select: { amount: true, category: true },
          where: { organizationId },
        })
      )
        .filter((row) => row.category !== CreditTransactionCategory.ADD)
        .map((row) => `${row.category}:${row.amount}`);

    const pay = (idempotencyKey = 'attempt-1') =>
      runWithTenantContext({ organizationId }, () =>
        service.payWithCredits({
          idempotencyKey,
          listingId: LISTING_ID,
          organizationId,
          userId,
        }),
      );

    beforeEach(() => {
      vi.stubEnv('GENFEED_CLOUD', '1');
      suffix = randomUUID();
      organizationId = `mkt-org-${suffix}`;
      billingAccountId = `mkt-billing-${suffix}`;
      userId = `mkt-user-${suffix}`;
      marketplace = new FakeMarketplace();
      const prisma = database().$extends(
        createTenantGuardExtension({
          billingAccountModelNames: discoverBillingAccountModelNames(schema),
          isCloud: true,
          tenantModelNames: new Set(
            discoverTenantModels(schema).map(({ model }) => model),
          ),
        }),
      ) as unknown as PrismaService;
      const balances = new CreditBalanceService(prisma, logger);
      const credits = new CreditsUtilsService(
        logger,
        prisma,
        new BillingAccountsService(prisma, logger),
        balances,
        {} as CreditReservationService,
        new CreditTransactionsService(prisma, logger, balances, {
          invalidate: vi.fn().mockResolvedValue(undefined),
        } as unknown as CacheInvalidationService),
        {} as OrganizationSettingsService,
        {
          emit: vi.fn().mockResolvedValue(undefined),
        } as unknown as NotificationsPublisherService,
        {
          invalidateForOrganization: vi.fn().mockResolvedValue(undefined),
        } as unknown as AccessBootstrapCacheService,
        new TransactionUtil(prisma, logger),
        {
          assertTrialActive: vi.fn().mockResolvedValue(undefined),
        } as unknown as FreeTrialService,
      );
      service = new MarketplaceCreditPurchaseService(
        logger,
        marketplace.asClient(),
        credits,
        {
          signServiceToken: vi.fn().mockResolvedValue('signed-service-token'),
        } as unknown as BetterAuthService,
      );
    });

    afterEach(async () => {
      vi.unstubAllEnvs();
      const db = database();
      const scoped = { organizationId };
      await db.creditTransaction.deleteMany({ where: scoped });
      await db.creditBalance.deleteMany({ where: scoped });
      await db.organization.deleteMany({ where: { id: organizationId } });
      await db.billingAccount.deleteMany({ where: { id: billingAccountId } });
      await db.user.deleteMany({ where: { id: userId } });
    });

    afterAll(async () => {
      await client?.$disconnect();
    });

    it('takes the GEN price once and leaves one completed purchase in the marketplace', async () => {
      await seedWallet(5000);

      const result = await pay();

      expect(result).toEqual({
        creditsPaid: GEN_PRICE,
        listingId: LISTING_ID,
        purchaseId: 'purchase-1',
      });
      expect(await balance()).toBe(5000 - GEN_PRICE);
      expect(marketplace.purchases.size).toBe(1);
      expect(await ledger()).toEqual([`deduct:${GEN_PRICE}`]);
    });

    it('takes nothing more and creates no second purchase when the request is retried', async () => {
      await seedWallet(5000);

      const first = await pay();
      const retry = await pay();

      expect(retry).toEqual(first);
      expect(await balance()).toBe(5000 - GEN_PRICE);
      expect(marketplace.purchases.size).toBe(1);
      expect(await ledger()).toEqual([`deduct:${GEN_PRICE}`]);
    });

    it('still completes a retry after the balance has dropped below the price', async () => {
      await seedWallet(GEN_PRICE + 5);
      marketplace.recordMode = 'down';
      marketplace.refundMode = 'down';
      await expect(pay()).rejects.toThrow('could not confirm');
      expect(await balance()).toBe(5);

      marketplace.recordMode = 'ok';
      const result = await pay();

      expect(result.purchaseId).toBe('purchase-1');
      expect(await balance()).toBe(5);
      expect(await ledger()).toEqual([`deduct:${GEN_PRICE}`]);
    });

    it('takes nothing and reports the shortfall when the balance is too low', async () => {
      await seedWallet(1000);

      const attempt = pay();

      await expect(attempt).rejects.toMatchObject({
        status: 402,
        response: {
          meta: { available: 1000, missing: 1175, required: GEN_PRICE },
        },
      });
      expect(await balance()).toBe(1000);
      expect(marketplace.recordCalls).toBe(0);
      expect(await ledger()).toEqual([]);
    });

    it('returns the credits when the marketplace refuses the purchase', async () => {
      await seedWallet(5000);
      marketplace.recordMode = 'reject-409';

      await expect(pay()).rejects.toMatchObject({ status: 409 });

      expect(await balance()).toBe(5000);
      expect(marketplace.purchases.size).toBe(0);
      expect(await ledger()).toEqual([
        `deduct:${GEN_PRICE}`,
        `refund:${GEN_PRICE}`,
      ]);
    });

    it('returns the credits when the marketplace is down and holds no purchase', async () => {
      await seedWallet(5000);
      marketplace.recordMode = 'down';

      await expect(pay()).rejects.toThrow('credits were returned');

      expect(await balance()).toBe(5000);
      expect(marketplace.purchases.size).toBe(0);
    });

    it('refunds the late purchase and returns the credits when the marketplace answered too late', async () => {
      await seedWallet(5000);
      marketplace.recordMode = 'down';
      marketplace.storeWhenDown = true;

      await expect(pay()).rejects.toThrow('credits were returned');

      expect(await balance()).toBe(5000);
      expect(marketplace.purchases.size).toBe(0);
    });

    it('keeps the credits taken while it cannot learn whether the purchase exists', async () => {
      await seedWallet(5000);
      marketplace.recordMode = 'down';
      marketplace.refundMode = 'down';

      await expect(pay()).rejects.toThrow('could not confirm');

      expect(await balance()).toBe(5000 - GEN_PRICE);
      expect(await ledger()).toEqual([`deduct:${GEN_PRICE}`]);
    });

    it('charges a new buying attempt after an earlier one failed and was returned', async () => {
      await seedWallet(5000);
      marketplace.recordMode = 'reject-409';
      await expect(pay('attempt-1')).rejects.toMatchObject({ status: 409 });

      marketplace.recordMode = 'ok';
      const result = await pay('attempt-2');

      expect(result.creditsPaid).toBe(GEN_PRICE);
      expect(await balance()).toBe(5000 - GEN_PRICE);
      expect(await ledger()).toEqual([
        `deduct:${GEN_PRICE}`,
        `refund:${GEN_PRICE}`,
        `deduct:${GEN_PRICE}`,
      ]);
    });

    it('takes nothing for a listing that cannot be paid in credits', async () => {
      await seedWallet(5000);
      marketplace.quote = { status: 'not-payable' };

      await expect(pay()).rejects.toMatchObject({ status: 400 });

      expect(await balance()).toBe(5000);
      expect(marketplace.recordCalls).toBe(0);
    });
  },
);
