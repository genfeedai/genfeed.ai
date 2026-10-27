import { randomUUID } from 'node:crypto';
import { BillingAccountsService } from '@api/collections/billing-accounts/services/billing-accounts.service';
import { CreditBalanceService } from '@api/collections/credits/services/credit-balance.service';
import { CreditReservationService } from '@api/collections/credits/services/credit-reservation.service';
import { CreditTransactionsService } from '@api/collections/credits/services/credit-transactions.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { FreeTrialService } from '@api/collections/credits/services/free-trial.service';
import { RetryCreditBackService } from '@api/collections/credits/services/retry-credit-back.service';
import type { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import type { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import type { CacheInvalidationService } from '@api/common/services/cache-invalidation.service';
import { TransactionUtil } from '@api/helpers/utils/transaction/transaction.util';
import type { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ActivitySource,
  CreditTransactionCategory,
  IngredientCategory,
  IngredientOrigin,
  IngredientStatus,
} from '@genfeedai/contracts';
import {
  RETRY_CREDIT_BACK_DAILY_CAP_CREDITS,
  RETRY_CREDIT_BACK_SOURCE,
  RETRY_CREDIT_BACK_WINDOW_MS,
} from '@genfeedai/contracts/constants';
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
const PROMPT = 'A red fox running through fresh snow at dawn';
const MODEL = 'google/imagen-4';
const HOUR_MS = 60 * 60 * 1000;

interface Attempt {
  createdAt?: Date;
  isDraftRender?: boolean;
  model?: string;
  prompt?: string;
  status?: IngredientStatus;
  userId?: string;
}

describe.skipIf(!connectionString)('retry credit back (PostgreSQL)', () => {
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
  let userId: string;
  let otherUserId: string;
  let organizationId: string;
  let billingAccountId: string;
  let brandId: string;
  let service: RetryCreditBackService;

  async function seedOrganization(isPaying: boolean): Promise<void> {
    const db = database();
    await db.user.createMany({
      data: [
        { handle: userId, id: userId },
        { handle: otherUserId, id: otherUserId },
      ],
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
    await db.organizationSetting.create({ data: { organizationId } });
    await db.creditBalance.create({
      data: {
        balance: 0,
        billingAccountId,
        heldAmount: 0,
        organizationId,
        version: 0,
      },
    });
    await db.brand.create({
      data: {
        id: brandId,
        label: brandId,
        organizationId,
        slug: brandId,
        userId,
      },
    });
    if (isPaying) {
      await db.creditTransaction.create({
        data: {
          amount: 1000,
          balanceAfter: 1000,
          category: CreditTransactionCategory.ADD,
          organizationId,
          source: ActivitySource.PAY_AS_YOU_GO,
        },
      });
    }
  }

  function attempt(options: Attempt = {}) {
    return database().ingredient.create({
      data: {
        brandId,
        category: IngredientCategory.IMAGE,
        createdAt: options.createdAt ?? new Date(),
        generationPrompt: options.prompt ?? PROMPT,
        isDraftRender: options.isDraftRender ?? false,
        modelUsed: options.model ?? MODEL,
        organizationId,
        origin: IngredientOrigin.GENERATED,
        status: options.status ?? IngredientStatus.GENERATED,
        userId: options.userId ?? userId,
      },
    });
  }

  const creditBack = (ingredientId: string, chargedCredits = 40) =>
    service.grantForSettledOutput({
      chargedCredits,
      ingredientId,
      organizationId,
    });

  const grants = () =>
    database().creditTransaction.findMany({
      where: { organizationId, source: RETRY_CREDIT_BACK_SOURCE },
    });

  beforeEach(() => {
    vi.stubEnv('GENFEED_CLOUD', '1');
    suffix = randomUUID();
    userId = `rcb-user-${suffix}`;
    otherUserId = `rcb-other-${suffix}`;
    organizationId = `rcb-org-${suffix}`;
    billingAccountId = `rcb-billing-${suffix}`;
    brandId = `rcb-brand-${suffix}`;
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
      findOne: (where: { organizationId: string }) =>
        database().organizationSetting.findFirst({ where }),
      patch: (id: string, data: { hasEverHadCredits: boolean }) =>
        database().organizationSetting.update({ data, where: { id } }),
    } as unknown as OrganizationSettingsService;
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
    const credits = new CreditsUtilsService(
      logger,
      prismaService,
      new BillingAccountsService(prismaService, logger),
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
    service = new RetryCreditBackService(
      prismaService,
      credits,
      freeTrial,
      logger,
    );
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    if (!organizationId) return;
    const db = database();
    await db.ingredient.deleteMany({ where: { organizationId } });
    await db.activity.deleteMany({ where: { organizationId } });
    await db.creditTransaction.deleteMany({ where: { organizationId } });
    await db.creditBalance.deleteMany({ where: { organizationId } });
    await db.brand.deleteMany({ where: { organizationId } });
    await db.organizationSetting.deleteMany({ where: { organizationId } });
    await db.organization.deleteMany({ where: { id: organizationId } });
    await db.billingAccount.deleteMany({ where: { id: billingAccountId } });
    await db.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('returns a quarter of the retry price once, as expiring credits', async () => {
    await seedOrganization(true);
    await attempt({ createdAt: new Date(Date.now() - 2 * HOUR_MS) });
    const retry = await attempt();

    expect(await creditBack(retry.id)).toBe(10);
    expect(await creditBack(retry.id)).toBe(0);

    const [grant, ...others] = await grants();
    expect(others).toHaveLength(0);
    expect(grant).toMatchObject({
      actorUserId: userId,
      amount: 10,
      brandId,
      referenceId: retry.id,
      referenceType: RETRY_CREDIT_BACK_SOURCE,
    });
    const balance = await database().creditBalance.findFirstOrThrow({
      where: { organizationId },
    });
    expect(balance.balance).toBe(10);
  });

  it('treats case and spacing as the same brief', async () => {
    await seedOrganization(true);
    await attempt({
      createdAt: new Date(Date.now() - HOUR_MS),
      prompt: `  ${PROMPT.toUpperCase().replace(/ /g, '   ')} `,
      status: IngredientStatus.REJECTED,
    });
    const retry = await attempt();

    expect(await creditBack(retry.id)).toBe(10);
  });

  it.each([
    ['a first attempt', async () => undefined],
    [
      'a prior attempt older than 24 hours',
      () =>
        attempt({
          createdAt: new Date(
            Date.now() - RETRY_CREDIT_BACK_WINDOW_MS - HOUR_MS,
          ),
        }),
    ],
    ['a different prompt', () => attempt({ prompt: 'A blue heron at dusk' })],
    ['a different model', () => attempt({ model: 'black-forest-labs/flux-2' })],
    ["another user's attempt", () => attempt({ userId: otherUserId })],
    ['a prior draft render', () => attempt({ isDraftRender: true })],
    [
      'a prior attempt that failed',
      () => attempt({ status: IngredientStatus.FAILED }),
    ],
  ])('earns nothing for %s', async (_label, seedPrior) => {
    await seedOrganization(true);
    await seedPrior();
    const retry = await attempt();

    expect(await creditBack(retry.id)).toBe(0);
    expect(await grants()).toHaveLength(0);
  });

  it('earns nothing when the retry is itself a draft', async () => {
    await seedOrganization(true);
    await attempt({ createdAt: new Date(Date.now() - HOUR_MS) });
    const retry = await attempt({ isDraftRender: true });

    expect(await creditBack(retry.id)).toBe(0);
  });

  it('earns nothing in a free-trial organization', async () => {
    await seedOrganization(false);
    await attempt({ createdAt: new Date(Date.now() - HOUR_MS) });
    const retry = await attempt();

    expect(await creditBack(retry.id)).toBe(0);
    expect(await grants()).toHaveLength(0);
  });

  it('stops at the per-user daily cap', async () => {
    await seedOrganization(true);
    await database().creditTransaction.create({
      data: {
        actorUserId: userId,
        amount: RETRY_CREDIT_BACK_DAILY_CAP_CREDITS - 5,
        category: CreditTransactionCategory.ADD,
        organizationId,
        source: RETRY_CREDIT_BACK_SOURCE,
      },
    });
    await attempt({ createdAt: new Date(Date.now() - HOUR_MS) });
    const retry = await attempt();

    expect(await creditBack(retry.id, 400)).toBe(5);
  });

  it("does not read another organization's attempts", async () => {
    await seedOrganization(true);
    const retry = await attempt();
    const stranger = `rcb-stranger-${suffix}`;

    expect(
      await service.grantForSettledOutput({
        chargedCredits: 40,
        ingredientId: retry.id,
        organizationId: stranger,
      }),
    ).toBe(0);
  });
});
