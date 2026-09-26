import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { PrismaClient } from '@genfeedai/prisma';
import type { ConfigService } from '@libs/config/config.service';
import { runWithTenantContext } from '@libs/prisma/tenant-context';
import { TenantIsolationError } from '@libs/prisma/tenant-guard';
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
import { resolveBillingAccountAccess } from './billing-account-scope';
import { billingAccountScopedWhere } from './scoped-where';

vi.unmock('@genfeedai/prisma');
vi.unmock('@prisma/adapter-pg');

// Explicit opt-in only: use an isolated migrated database, never DATABASE_URL.
const connectionString = process.env.BILLING_ACCOUNT_SCOPE_TEST_DATABASE_URL;

/**
 * Real Prisma client + real database (#5217 acceptance criteria: "tests
 * against a real Prisma client and DB on the Studio, not mocks only"). This
 * proves two things a mocked test cannot: that `resolveForOrganization`'s
 * literal LINKED/`isDeleted` semantics actually hold against Postgres, and
 * that the runtime tenant guard's billing-account branch really executes
 * inside a live `$extends`-wrapped client, not just against fabricated args.
 */
describe.skipIf(!connectionString)(
  'resolveBillingAccountAccess PostgreSQL isolation (#5217)',
  () => {
    const prisma = connectionString
      ? new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
      : null;
    const database = () => {
      if (!prisma) {
        throw new Error('BILLING_ACCOUNT_SCOPE_TEST_DATABASE_URL is required');
      }
      return prisma;
    };

    let userId: string;
    let billingAccountIds: [string, string];
    let organizationIds: [string, string, string];
    let walletIds: [string, string];

    beforeEach(async () => {
      const suffix = randomUUID();
      userId = `bas-pg-user-${suffix}`;
      billingAccountIds = [
        `bas-pg-billing-a-${suffix}`,
        `bas-pg-billing-b-${suffix}`,
      ];
      organizationIds = [
        `bas-pg-org-a-${suffix}`,
        `bas-pg-org-b-${suffix}`,
        `bas-pg-org-c-${suffix}`,
      ];
      const db = database();
      await db.user.create({ data: { handle: userId, id: userId } });

      for (const [index, billingAccountId] of billingAccountIds.entries()) {
        await db.billingAccount.create({ data: { id: billingAccountId } });
        await db.organization.create({
          data: {
            billingAccountId,
            id: organizationIds[index],
            label: organizationIds[index],
            slug: organizationIds[index],
            userId,
          },
        });
      }

      // Org C exists but was never attached or LINKED to any billing account.
      await db.organization.create({
        data: {
          id: organizationIds[2],
          label: organizationIds[2],
          slug: organizationIds[2],
          userId,
        },
      });

      const wallets = await Promise.all(
        billingAccountIds.map((billingAccountId, index) =>
          db.creditBalance.create({
            data: {
              balance: (index + 1) * 100,
              billingAccountId,
              heldAmount: 0,
              version: 0,
            },
          }),
        ),
      );
      walletIds = [wallets[0].id, wallets[1].id];
    });

    afterEach(async () => {
      const db = database();
      await db.creditBalance.deleteMany({
        where: { billingAccountId: { in: billingAccountIds } },
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

    it('refuses a scope for an organization with no billing-account link', async () => {
      await expect(
        resolveBillingAccountAccess(organizationIds[2], database()),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses a scope for an organization that does not exist', async () => {
      await expect(
        resolveBillingAccountAccess('does-not-exist', database()),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('resolves a scope that only unlocks its own billing account rows, never another account', async () => {
      const db = database();
      const scope = await resolveBillingAccountAccess(organizationIds[0], db);
      expect(scope.billingAccountId).toBe(billingAccountIds[0]);

      const ownWallet = await db.creditBalance.findFirst({
        where: billingAccountScopedWhere(scope, {}),
      });
      expect(ownWallet?.id).toBe(walletIds[0]);

      // billingAccountId is non-overridable: naming the other account's
      // wallet id does not leak it, the query still only matches this
      // scope's own billing account.
      const attemptedCrossAccountRead = await db.creditBalance.findFirst({
        where: billingAccountScopedWhere(scope, { id: walletIds[1] }),
      });
      expect(attemptedCrossAccountRead).toBeNull();
    });

    it('denies, at the real runtime tenant guard, a query for another billing account (not just via the helper)', async () => {
      const configService = {
        get: (key: string) =>
          ({ DATABASE_URL: connectionString, GENFEED_CLOUD: '1' })[
            key as 'DATABASE_URL' | 'GENFEED_CLOUD'
          ],
        mediaUrlConfig: { cdnUrl: 'https://cdn.test' },
      } as unknown as ConfigService;
      const guardedPrisma = new PrismaService(configService);

      try {
        await runWithTenantContext(
          { organizationId: organizationIds[0] },
          async () => {
            const scope = await resolveBillingAccountAccess(
              organizationIds[0],
              guardedPrisma,
            );
            const ownWallet = await guardedPrisma.creditBalance.findFirst({
              where: billingAccountScopedWhere(scope, {}),
            });
            expect(ownWallet?.id).toBe(walletIds[0]);

            // Org A never resolved a scope for billing account B this
            // request. A raw query naming B's billingAccountId — even from
            // application code that "knows" the id — is denied by the
            // runtime guard itself, independent of whether the caller used
            // billingAccountScopedWhere.
            await expect(
              guardedPrisma.creditBalance.findFirst({
                where: {
                  billingAccountId: billingAccountIds[1],
                  isDeleted: false,
                },
              }),
            ).rejects.toBeInstanceOf(TenantIsolationError);
          },
        );
      } finally {
        await guardedPrisma.$disconnect();
      }
    });
  },
);
