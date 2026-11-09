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
import { TransactionUtil } from '@api/helpers/utils/transaction/transaction.util';
import type { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ActivitySource,
  CreditTransactionCategory,
  CreditTransferKind,
} from '@genfeedai/contracts';
import { CREATOR_PAYMENT_REFERENCE_TYPE } from '@genfeedai/contracts/constants';
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

describe.skipIf(!connectionString)('credit transfers (PostgreSQL)', () => {
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
      billingAccountId: `ct-${role}-billing-${suffix}`,
      organizationId: `ct-${role}-org-${suffix}`,
      userId: `ct-${role}-user-${suffix}`,
    };
  }

  async function seedWorkspace(
    owner: Workspace,
    wallet: { balance: number; earnedBalance?: number; paid: boolean },
  ): Promise<void> {
    const db = database();
    await db.user.create({ data: { handle: owner.userId, id: owner.userId } });
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
      select: { balance: true, earnedBalance: true },
      where: { isDeleted: false, organizationId: owner.organizationId },
    });

  const transferRows = (owner: Workspace) =>
    database().creditTransaction.findMany({
      orderBy: { createdAt: 'asc' },
      where: {
        category: {
          in: [
            CreditTransactionCategory.TRANSFER_IN,
            CreditTransactionCategory.TRANSFER_OUT,
          ],
        },
        organizationId: owner.organizationId,
      },
    });

  const tip = (amount: number, idempotencyKey: string) =>
    transfers.transfer({
      amount,
      idempotencyKey,
      kind: CreditTransferKind.TIP,
      message: 'Loved this piece',
      payeeOrganizationId: creator.organizationId,
      payerOrganizationId: reader.organizationId,
      payerUserId: reader.userId,
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

  it('moves credits from the reader to the creator as earned credits, with one linked row on each side', async () => {
    await seedWorkspace(reader, { balance: 100, paid: true });
    await seedWorkspace(creator, { balance: 10, paid: false });

    const result = await tip(25, 'tip-1');

    expect(result).toMatchObject({
      feeAmount: 0,
      grossAmount: 25,
      netAmount: 25,
      payerBalanceAfter: 75,
      wasApplied: true,
    });
    expect(await wallet(reader)).toEqual({ balance: 75, earnedBalance: 0 });
    expect(await wallet(creator)).toEqual({ balance: 35, earnedBalance: 25 });

    const [sent] = await transferRows(reader);
    const [received] = await transferRows(creator);
    expect(sent).toMatchObject({
      amount: 25,
      balanceAfter: 75,
      category: 'transfer-out',
      referenceId: result.transferId,
      referenceType: CREATOR_PAYMENT_REFERENCE_TYPE,
      source: 'tip',
    });
    expect(received).toMatchObject({
      amount: 25,
      balanceAfter: 35,
      category: 'transfer-in',
      referenceId: result.transferId,
      referenceType: CREATOR_PAYMENT_REFERENCE_TYPE,
      source: 'tip',
    });
    expect(received?.metadata).toMatchObject({
      counterpartyOrganizationId: reader.organizationId,
      message: 'Loved this piece',
      payerUserId: reader.userId,
    });
  });

  it('returns the first transfer when retried with the same key', async () => {
    await seedWorkspace(reader, { balance: 100, paid: true });
    await seedWorkspace(creator, { balance: 0, paid: false });

    const first = await tip(40, 'tip-retry');
    const retry = await tip(40, 'tip-retry');

    expect(retry).toMatchObject({
      grossAmount: 40,
      transferId: first.transferId,
      wasApplied: false,
    });
    expect(await wallet(reader)).toEqual({ balance: 60, earnedBalance: 0 });
    expect(await wallet(creator)).toEqual({ balance: 40, earnedBalance: 40 });
    expect(await transferRows(reader)).toHaveLength(1);
    expect(await transferRows(creator)).toHaveLength(1);
  });

  it('never overdraws the reader under concurrent transfers', async () => {
    await seedWorkspace(reader, { balance: 100, paid: true });
    await seedWorkspace(creator, { balance: 0, paid: false });

    const outcomes = await Promise.allSettled(
      ['a', 'b', 'c', 'd', 'e', 'f'].map((key) => tip(30, `tip-race-${key}`)),
    );
    const applied = outcomes.filter(
      (outcome) => outcome.status === 'fulfilled',
    ).length;

    const readerWallet = await wallet(reader);
    const creatorWallet = await wallet(creator);
    expect(applied).toBeGreaterThanOrEqual(1);
    expect(applied).toBeLessThanOrEqual(3);
    expect(readerWallet.balance).toBe(100 - applied * 30);
    expect(readerWallet.balance).toBeGreaterThanOrEqual(0);
    expect(creatorWallet).toEqual({
      balance: applied * 30,
      earnedBalance: applied * 30,
    });
    expect(await transferRows(reader)).toHaveLength(applied);
    expect(await transferRows(creator)).toHaveLength(applied);
  });

  it('rejects a payment larger than the reader can afford and leaves both wallets untouched', async () => {
    await seedWorkspace(reader, { balance: 20, paid: true });
    await seedWorkspace(creator, { balance: 0, paid: false });

    await expect(tip(21, 'tip-too-big')).rejects.toThrow(
      'Insufficient organization credits',
    );
    expect(await wallet(reader)).toEqual({ balance: 20, earnedBalance: 0 });
    expect(await wallet(creator)).toEqual({ balance: 0, earnedBalance: 0 });
  });

  it('rejects free trial credits and payments to your own organization', async () => {
    await seedWorkspace(reader, { balance: 100, paid: false });
    await seedWorkspace(creator, { balance: 0, paid: false });

    await expect(tip(10, 'tip-trial')).rejects.toThrow(
      'Free trial credits cannot be sent',
    );
    await expect(
      transfers.transfer({
        amount: 10,
        idempotencyKey: 'tip-self',
        kind: CreditTransferKind.TIP,
        payeeOrganizationId: reader.organizationId,
        payerOrganizationId: reader.organizationId,
        payerUserId: reader.userId,
      }),
    ).rejects.toThrow('You cannot pay your own organization');
    expect(await wallet(reader)).toEqual({ balance: 100, earnedBalance: 0 });
  });

  it('rejects a payment between organizations that share one wallet', async () => {
    await seedWorkspace(reader, { balance: 100, paid: true });
    await seedWorkspace(creator, { balance: 0, paid: false });
    // The creator organization is linked onto the reader's billing account.
    await database().organization.update({
      data: { billingAccountId: reader.billingAccountId },
      where: { id: creator.organizationId },
    });

    await expect(tip(10, 'tip-shared-wallet')).rejects.toThrow(
      'You cannot pay an organization that shares your billing account',
    );
    expect(await wallet(reader)).toEqual({ balance: 100, earnedBalance: 0 });
  });

  it('spends purchased credits before earned ones and keeps earned credits through a plan reset', async () => {
    await seedWorkspace(reader, { balance: 100, paid: true });
    await seedWorkspace(creator, { balance: 50, paid: true });
    await tip(30, 'tip-earned');

    await credits.deductCreditsFromOrganization(
      creator.organizationId,
      creator.userId,
      60,
      'Image generation',
      ActivitySource.SCRIPT,
    );
    expect(await wallet(creator)).toEqual({ balance: 20, earnedBalance: 20 });

    await credits.resetOrganizationCredits(
      creator.organizationId,
      100,
      'monthly',
      'Plan period reset',
    );
    expect(await wallet(creator)).toEqual({ balance: 120, earnedBalance: 20 });
  });
});
