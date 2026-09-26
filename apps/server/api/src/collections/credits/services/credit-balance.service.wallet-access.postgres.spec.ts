import { randomUUID } from 'node:crypto';
import { CreditBalanceService } from '@api/collections/credits/services/credit-balance.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { BillingAccountOrganizationStatus } from '@genfeedai/contracts';
import { PrismaClient } from '@genfeedai/prisma';
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
// Skipped unless `CREDIT_BALANCE_TEST_DATABASE_URL` is set.
const connectionString = process.env.CREDIT_BALANCE_TEST_DATABASE_URL;

describe.skipIf(!connectionString)(
  'CreditBalanceService wallet access against a real database',
  () => {
    const prisma = connectionString
      ? new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
      : null;
    const database = () => {
      if (!prisma) {
        throw new Error('CREDIT_BALANCE_TEST_DATABASE_URL is required');
      }
      return prisma;
    };
    const logger = {
      error: vi.fn(),
      warn: vi.fn(),
    } as unknown as LoggerService;

    let userId: string;
    let organizationIds: string[];
    let billingAccountIds: string[];
    let service: CreditBalanceService;

    beforeEach(async () => {
      const suffix = randomUUID();
      userId = `wallet-access-user-${suffix}`;
      organizationIds = ['own', 'direct', 'linked', 'unlinked', 'owner'].map(
        (label) => `wallet-access-org-${label}-${suffix}`,
      );
      billingAccountIds = ['direct', 'linked', 'unlinked'].map(
        (label) => `wallet-access-ba-${label}-${suffix}`,
      );
      const [orgOwn, orgDirect, orgLinked, orgUnlinked, orgOwner] =
        organizationIds;
      const [baDirect, baLinked, baUnlinked] = billingAccountIds;

      const db = database();
      await db.user.create({ data: { handle: userId, id: userId } });

      // "own": a plain organization with its own private wallet.
      await db.organization.create({
        data: {
          id: orgOwn,
          label: orgOwn,
          slug: orgOwn,
          userId,
        },
      });
      await db.creditBalance.create({
        data: { balance: 10, organizationId: orgOwn },
      });

      // "direct": organization attached to a shared billing account via
      // Organization.billingAccountId; the wallet has no owning organization.
      await db.billingAccount.create({ data: { id: baDirect } });
      await db.organization.create({
        data: {
          billingAccountId: baDirect,
          id: orgDirect,
          label: orgDirect,
          slug: orgDirect,
          userId,
        },
      });
      await db.creditBalance.create({
        data: { balance: 20, billingAccountId: baDirect },
      });

      // "linked": organization attached only through a LINKED
      // BillingAccountOrganization row, not Organization.billingAccountId.
      await db.billingAccount.create({ data: { id: baLinked } });
      await db.organization.create({
        data: {
          id: orgLinked,
          label: orgLinked,
          slug: orgLinked,
          userId,
        },
      });
      await db.billingAccountOrganization.create({
        data: {
          billingAccountId: baLinked,
          organizationId: orgLinked,
          status: BillingAccountOrganizationStatus.LINKED,
        },
      });
      await db.creditBalance.create({
        data: { balance: 30, billingAccountId: baLinked },
      });

      // "unlinked-denied": a wallet on a billing account owned by a different
      // organization, which `orgUnlinked` has never been attached to.
      await db.billingAccount.create({ data: { id: baUnlinked } });
      await db.organization.create({
        data: {
          id: orgOwner,
          label: orgOwner,
          slug: orgOwner,
          userId,
        },
      });
      await db.organization.create({
        data: {
          id: orgUnlinked,
          label: orgUnlinked,
          slug: orgUnlinked,
          userId,
        },
      });
      await db.creditBalance.create({
        data: {
          balance: 40,
          billingAccountId: baUnlinked,
          organizationId: orgOwner,
        },
      });

      service = new CreditBalanceService(
        db as unknown as PrismaService,
        logger,
      );
    });

    afterEach(async () => {
      const db = database();
      await db.creditReservation.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await db.creditBalance.deleteMany({
        where: {
          OR: [
            { organizationId: { in: organizationIds } },
            { billingAccountId: { in: billingAccountIds } },
          ],
        },
      });
      await db.billingAccountOrganization.deleteMany({
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

    it('own: returns the wallet the organization owns directly', async () => {
      const [orgOwn] = organizationIds;
      const balance = await service.getOrCreateBalance(orgOwn);
      expect(balance.organizationId).toBe(orgOwn);
      expect(balance.balance).toBe(10);
    });

    it('direct: returns the wallet on the billing account the organization is directly attached to', async () => {
      const [, orgDirect] = organizationIds;
      const [baDirect] = billingAccountIds;
      const balance = await service.getOrCreateBalance(
        orgDirect,
        undefined,
        baDirect,
      );
      expect(balance.billingAccountId).toBe(baDirect);
      expect(balance.balance).toBe(20);
    });

    it('linked: returns the wallet on the billing account a LINKED row attaches the organization to', async () => {
      const [, , orgLinked] = organizationIds;
      const [, baLinked] = billingAccountIds;
      const balance = await service.getOrCreateBalance(
        orgLinked,
        undefined,
        baLinked,
      );
      expect(balance.billingAccountId).toBe(baLinked);
      expect(balance.balance).toBe(30);
    });

    it('unlinked-denied: never reaches another organization wallet, and provisions its own untagged instead', async () => {
      const [, , , orgUnlinked] = organizationIds;
      const [, , baUnlinked] = billingAccountIds;
      const balance = await service.getOrCreateBalance(
        orgUnlinked,
        undefined,
        baUnlinked,
      );
      expect(balance.organizationId).toBe(orgUnlinked);
      expect(balance.billingAccountId).toBeNull();
      expect(balance.balance).toBe(0);

      const ownerWallet = await database().creditBalance.findFirst({
        where: {
          billingAccountId: baUnlinked,
          organizationId: { not: orgUnlinked },
        },
      });
      expect(ownerWallet?.balance).toBe(40);
    });

    it('unlinked-denied: never claims the wallet slot of a billing account that has no wallet yet', async () => {
      const [, , , orgUnlinked] = organizationIds;
      const [, , baUnlinked] = billingAccountIds;
      await database().creditBalance.deleteMany({
        where: { billingAccountId: baUnlinked },
      });

      const balance = await service.getOrCreateBalance(
        orgUnlinked,
        undefined,
        baUnlinked,
      );
      expect(balance.organizationId).toBe(orgUnlinked);
      expect(balance.billingAccountId).toBeNull();

      const claimed = await database().creditBalance.count({
        where: { billingAccountId: baUnlinked, isDeleted: false },
      });
      expect(claimed).toBe(0);
    });

    it('linked: provisions the billing account wallet when the account has none yet', async () => {
      const [, , orgLinked] = organizationIds;
      const [, baLinked] = billingAccountIds;
      await database().creditBalance.deleteMany({
        where: { billingAccountId: baLinked },
      });

      const balance = await service.getOrCreateBalance(
        orgLinked,
        undefined,
        baLinked,
      );
      expect(balance.organizationId).toBe(orgLinked);
      expect(balance.billingAccountId).toBe(baLinked);
      expect(balance.balance).toBe(0);
    });

    it('reservation-authorized: a detached organization still reaches the billing account its reservation holds credits on', async () => {
      const [, , , orgUnlinked] = organizationIds;
      const [, , baUnlinked] = billingAccountIds;
      const reservation = await database().creditReservation.create({
        data: {
          amount: 5,
          billingAccountId: baUnlinked,
          expiresAt: new Date(Date.now() + 60_000),
          idempotencyKey: `wallet-access-${orgUnlinked}`,
          organizationId: orgUnlinked,
        },
      });

      const balance = await service.getOrCreateBalance(
        orgUnlinked,
        undefined,
        baUnlinked,
        reservation.id,
      );

      expect(balance.billingAccountId).toBe(baUnlinked);
      expect(balance.balance).toBe(40);
    });

    it('reservation-authorized: a mismatched reservationId or billingAccountId reaches no wallet, and provisions the organization its own instead', async () => {
      const [, , , orgUnlinked] = organizationIds;
      const [baDirect, , baUnlinked] = billingAccountIds;
      const reservation = await database().creditReservation.create({
        data: {
          amount: 5,
          billingAccountId: baUnlinked,
          expiresAt: new Date(Date.now() + 60_000),
          idempotencyKey: `wallet-access-mismatch-${orgUnlinked}`,
          organizationId: orgUnlinked,
        },
      });

      // Right reservation, wrong billing account.
      const wrongBillingAccount = await service.getOrCreateBalance(
        orgUnlinked,
        undefined,
        baDirect,
        reservation.id,
      );
      expect(wrongBillingAccount.organizationId).toBe(orgUnlinked);
      expect(wrongBillingAccount.billingAccountId).toBeNull();
      expect(wrongBillingAccount.balance).toBe(0);

      await database().creditBalance.deleteMany({
        where: { organizationId: orgUnlinked },
      });

      // Right billing account, wrong (nonexistent) reservation.
      const wrongReservation = await service.getOrCreateBalance(
        orgUnlinked,
        undefined,
        baUnlinked,
        'reservation-that-does-not-exist',
      );
      expect(wrongReservation.organizationId).toBe(orgUnlinked);
      expect(wrongReservation.billingAccountId).toBeNull();
      expect(wrongReservation.balance).toBe(0);
    });
  },
);
