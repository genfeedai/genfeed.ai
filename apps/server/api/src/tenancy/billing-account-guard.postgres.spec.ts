import { randomUUID } from 'node:crypto';
import { BillingAccountsService } from '@api/collections/billing-accounts/services/billing-accounts.service';
import { CreditBalanceService } from '@api/collections/credits/services/credit-balance.service';
import { CreditReservationService } from '@api/collections/credits/services/credit-reservation.service';
import { CreditTransactionsService } from '@api/collections/credits/services/credit-transactions.service';
import type { CacheInvalidationService } from '@api/common/services/cache-invalidation.service';
import { StripeWebhookBillingService } from '@api/endpoints/webhooks/stripe/stripe-webhook-billing.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { TransactionUtil } from '@api/helpers/utils/transaction/transaction.util';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  BillingAccountMemberRole,
  BillingAccountOrganizationStatus,
  MemberRole,
  SubscriptionStatus,
} from '@genfeedai/contracts';
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
 * Real Prisma client + real Postgres, running through the actual
 * `$extends`-wrapped `PrismaService` (GENFEED_CLOUD=1) — not mocks — for
 * every scenario the #5231 security review flagged (#5217, MAJOR 3):
 * `linkOrganization` end to end, credit reserve/settle/release in both a
 * worker (no tenant context) and an HTTP (tenant context) shape, a Stripe
 * webhook subscription write, the LINKED-organization branch, deleted
 * link/account/organization, a multiple-link conflict, and the cross-org
 * OR/data cases the review's MAJOR 1 covers.
 */
describe.skipIf(!connectionString)(
  'billing-account guard PostgreSQL end-to-end (#5217)',
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

    const configService = {
      get: (key: string) =>
        ({ DATABASE_URL: connectionString, GENFEED_CLOUD: '1' })[
          key as 'DATABASE_URL' | 'GENFEED_CLOUD'
        ],
      mediaUrlConfig: { cdnUrl: 'https://cdn.test' },
    } as unknown as ConfigService;
    const guardedPrisma = new PrismaService(configService);

    const logger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };
    const billingAccounts = new BillingAccountsService(
      guardedPrisma,
      logger as never,
    );
    const transactionUtil = new TransactionUtil(guardedPrisma, logger as never);
    const creditBalance = new CreditBalanceService(
      guardedPrisma,
      logger as never,
    );
    const creditTransactions = new CreditTransactionsService(
      guardedPrisma,
      logger as never,
      creditBalance,
      {
        invalidate: vi.fn().mockResolvedValue(undefined),
      } as unknown as CacheInvalidationService,
    );
    const creditReservations = new CreditReservationService(
      guardedPrisma,
      logger as never,
      creditBalance,
      creditTransactions,
      transactionUtil,
    );
    const stripeWebhookBilling = new StripeWebhookBillingService(
      guardedPrisma,
      billingAccounts,
    );

    let userId: string;
    let actorMemberRoleId: string;
    let billingAccountIds: [string, string];
    let organizationIds: [string, string];

    beforeEach(async () => {
      const suffix = randomUUID();
      userId = `bag-pg-user-${suffix}`;
      billingAccountIds = [
        `bag-pg-billing-a-${suffix}`,
        `bag-pg-billing-b-${suffix}`,
      ];
      organizationIds = [`bag-pg-org-a-${suffix}`, `bag-pg-org-b-${suffix}`];
      const db = database();
      await db.user.create({ data: { handle: userId, id: userId } });

      const role = await db.role.create({
        data: { key: `bag-pg-role-${suffix}`, label: 'Owner' },
      });
      actorMemberRoleId = role.id;

      // Org A: unlinked to start (linkOrganization under test attaches it).
      // Org B: exists as an unrelated tenant for cross-org rejection checks.
      for (const organizationId of organizationIds) {
        await db.organization.create({
          data: {
            id: organizationId,
            label: organizationId,
            slug: organizationId,
            userId,
          },
        });
        // currentBrandId is a required per-member invariant (#5219) — every
        // org needs at least one brand for its member row to reference.
        const brand = await db.brand.create({
          data: {
            label: organizationId,
            organizationId,
            slug: organizationId,
            userId,
          },
        });
        await db.member.create({
          data: {
            currentBrandId: brand.id,
            isActive: true,
            organizationId,
            roleId: actorMemberRoleId,
            roleKey: MemberRole.OWNER,
            userId,
          },
        });
      }

      await db.billingAccount.create({ data: { id: billingAccountIds[0] } });
      await db.billingAccountMember.create({
        data: {
          billingAccountId: billingAccountIds[0],
          role: BillingAccountMemberRole.OWNER,
          userId,
        },
      });
    });

    afterEach(async () => {
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
      await db.subscription.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await db.customer.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await db.billingAccountOrganization.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await db.member.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await db.brand.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await db.organization.deleteMany({
        where: { id: { in: organizationIds } },
      });
      await db.billingAccountMember.deleteMany({
        where: { billingAccountId: { in: billingAccountIds } },
      });
      await db.billingAccount.deleteMany({
        where: { id: { in: billingAccountIds } },
      });
      await db.role.delete({ where: { id: actorMemberRoleId } });
      await db.user.deleteMany({ where: { id: userId } });
    });

    afterAll(async () => {
      await prisma?.$disconnect();
      await guardedPrisma.$disconnect();
    });

    it('links an organization to a billing account end to end, inside a matching tenant context', async () => {
      const linked = await runWithTenantContext(
        { organizationId: organizationIds[0] },
        () =>
          billingAccounts.linkOrganization({
            actorUserId: userId,
            billingAccountId: billingAccountIds[0],
            organizationId: organizationIds[0],
          }),
      );
      expect(linked.id).toBe(billingAccountIds[0]);

      const db = database();
      const organization = await db.organization.findUniqueOrThrow({
        where: { id: organizationIds[0] },
      });
      expect(organization.billingAccountId).toBe(billingAccountIds[0]);

      const link = await db.billingAccountOrganization.findFirstOrThrow({
        where: {
          billingAccountId: billingAccountIds[0],
          organizationId: organizationIds[0],
        },
      });
      expect(link.status).toBe(BillingAccountOrganizationStatus.LINKED);

      const wallet = await db.creditBalance.findFirstOrThrow({
        where: { organizationId: organizationIds[0] },
      });
      expect(wallet.billingAccountId).toBe(billingAccountIds[0]);
    });

    it('resolves via the LINKED BillingAccountOrganization branch, not direct attachment', async () => {
      const db = database();
      await db.billingAccountOrganization.create({
        data: {
          billingAccountId: billingAccountIds[0],
          organizationId: organizationIds[0],
          status: BillingAccountOrganizationStatus.LINKED,
        },
      });

      const scope = await runWithTenantContext(
        { organizationId: organizationIds[0] },
        () => resolveBillingAccountAccess(organizationIds[0], guardedPrisma),
      );
      expect(scope.billingAccountId).toBe(billingAccountIds[0]);
    });

    it('rejects resolution when the organization row is deleted', async () => {
      const db = database();
      await db.organization.update({
        data: { isDeleted: true },
        where: { id: organizationIds[0] },
      });

      await expect(
        runWithTenantContext({ organizationId: organizationIds[0] }, () =>
          resolveBillingAccountAccess(organizationIds[0], guardedPrisma),
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects resolution when the directly-attached billing account row is deleted', async () => {
      const db = database();
      await db.organization.update({
        data: { billingAccountId: billingAccountIds[0] },
        where: { id: organizationIds[0] },
      });
      await db.billingAccount.update({
        data: { isDeleted: true },
        where: { id: billingAccountIds[0] },
      });

      await expect(
        runWithTenantContext({ organizationId: organizationIds[0] }, () =>
          resolveBillingAccountAccess(organizationIds[0], guardedPrisma),
        ),
      ).rejects.toThrow('Billing account could not be resolved');
    });

    it('rejects resolution when every LINKED row is deleted (falls through to not-found)', async () => {
      const db = database();
      await db.billingAccountOrganization.create({
        data: {
          billingAccountId: billingAccountIds[0],
          isDeleted: true,
          organizationId: organizationIds[0],
          status: BillingAccountOrganizationStatus.LINKED,
        },
      });

      await expect(
        runWithTenantContext({ organizationId: organizationIds[0] }, () =>
          resolveBillingAccountAccess(organizationIds[0], guardedPrisma),
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    // The ">1 LINKED row" ambiguous-conflict branch in
    // resolveBillingAccountAccess cannot be exercised against a real
    // database: billing_account_organizations_active_org_key is a partial
    // unique index on (organizationId) WHERE status = 'LINKED' AND
    // "isDeleted" = false, so Postgres itself refuses a second live LINKED
    // row for the same organization before the code ever runs. See
    // billing-account-scope.spec.ts's "rejects when more than one LINKED row
    // is returned (ambiguous)" for that defensive branch, proven with a fake
    // client instead.
    it('confirms the database itself forbids a second live LINKED row for the same organization', async () => {
      const db = database();
      await db.billingAccount.create({ data: { id: billingAccountIds[1] } });
      await db.billingAccountOrganization.create({
        data: {
          billingAccountId: billingAccountIds[0],
          organizationId: organizationIds[0],
          status: BillingAccountOrganizationStatus.LINKED,
        },
      });

      await expect(
        db.billingAccountOrganization.create({
          data: {
            billingAccountId: billingAccountIds[1],
            organizationId: organizationIds[0],
            status: BillingAccountOrganizationStatus.LINKED,
          },
        }),
      ).rejects.toThrow(/unique constraint/i);
    });

    it('reserves, settles, and releases credits with no tenant context (BullMQ/worker shape)', async () => {
      const db = database();
      await db.organization.update({
        data: { billingAccountId: billingAccountIds[0] },
        where: { id: organizationIds[0] },
      });
      await db.creditBalance.create({
        data: {
          balance: 100,
          billingAccountId: billingAccountIds[0],
          heldAmount: 0,
          organizationId: organizationIds[0],
          version: 0,
        },
      });

      // Deliberately not wrapped in runWithTenantContext — a BullMQ
      // processor never establishes one.
      const reservation = await creditReservations.reserve({
        actorUserId: userId,
        amount: 20,
        billingAccountId: billingAccountIds[0],
        idempotencyKey: `bag-pg-reserve-${randomUUID()}`,
        organizationId: organizationIds[0],
      });

      const settled = await creditReservations.settle({
        actorUserId: userId,
        actualAmount: 15,
        description: 'worker settlement',
        organizationId: organizationIds[0],
        reservationId: reservation.id,
      });
      expect(settled.settled).toBe(85);
      expect(settled.held).toBe(0);

      const secondReservation = await creditReservations.reserve({
        actorUserId: userId,
        amount: 10,
        billingAccountId: billingAccountIds[0],
        idempotencyKey: `bag-pg-reserve-${randomUUID()}`,
        organizationId: organizationIds[0],
      });
      const released = await creditReservations.release({
        organizationId: organizationIds[0],
        reason: 'release',
        reservationId: secondReservation.id,
      });
      expect(released.held).toBe(0);
    });

    it('reserves and settles credits inside an authenticated tenant context (HTTP shape)', async () => {
      const db = database();
      await db.organization.update({
        data: { billingAccountId: billingAccountIds[0] },
        where: { id: organizationIds[0] },
      });
      await db.creditBalance.create({
        data: {
          balance: 50,
          billingAccountId: billingAccountIds[0],
          heldAmount: 0,
          organizationId: organizationIds[0],
          version: 0,
        },
      });

      await runWithTenantContext(
        { organizationId: organizationIds[0] },
        async () => {
          const reservation = await creditReservations.reserve({
            actorUserId: userId,
            amount: 10,
            billingAccountId: billingAccountIds[0],
            idempotencyKey: `bag-pg-reserve-http-${randomUUID()}`,
            organizationId: organizationIds[0],
          });
          const settled = await creditReservations.settle({
            actorUserId: userId,
            actualAmount: 10,
            description: 'http settlement',
            organizationId: organizationIds[0],
            reservationId: reservation.id,
          });
          expect(settled.settled).toBe(40);
        },
      );
    });

    it('persists a Stripe-driven subscription update with no tenant context', async () => {
      const db = database();
      await db.organization.update({
        data: { billingAccountId: billingAccountIds[0] },
        where: { id: organizationIds[0] },
      });
      const account = await db.billingAccount.update({
        data: { stripeCustomerId: 'cus_bag_pg_test' },
        where: { id: billingAccountIds[0] },
      });
      const customer = await db.customer.create({
        data: {
          billingAccountId: null,
          organizationId: organizationIds[0],
          stripeCustomerId: 'cus_bag_pg_test',
        },
      });
      const subscription = await db.subscription.create({
        data: {
          customerId: customer.id,
          organizationId: organizationIds[0],
          status: SubscriptionStatus.ACTIVE,
          stripeSubscriptionId: 'sub_bag_pg_test',
          userId,
        },
      });

      const updated = await stripeWebhookBilling.persist(
        {
          billingAccountId: account.id,
          customerBillingAccountId: customer.billingAccountId,
          stripeCustomerId: 'cus_bag_pg_test',
          stripeSubscriptionId: 'sub_bag_pg_test',
          subscription,
        },
        {
          status: SubscriptionStatus.ACTIVE,
          stripeSubscriptionId: 'sub_bag_pg_test',
        },
      );
      expect(updated.id).toBe(subscription.id);

      const row = await db.subscription.findUniqueOrThrow({
        where: { id: subscription.id },
      });
      expect(row.status).toBe(SubscriptionStatus.ACTIVE);
    });

    it('rejects a mismatched organizationId hidden in an OR arm next to a valid billing scope (MAJOR 1)', async () => {
      const db = database();
      await db.organization.update({
        data: { billingAccountId: billingAccountIds[0] },
        where: { id: organizationIds[0] },
      });

      await runWithTenantContext(
        { organizationId: organizationIds[0] },
        async () => {
          const scope = await resolveBillingAccountAccess(
            organizationIds[0],
            guardedPrisma,
          );

          await expect(
            guardedPrisma.creditTransaction.findMany({
              where: {
                OR: [
                  { billingAccountId: scope.billingAccountId },
                  { organizationId: organizationIds[1] },
                ],
              },
            }),
          ).rejects.toBeInstanceOf(TenantIsolationError);
        },
      );
    });

    it('rejects a write that reassigns organizationId via data even with a valid billing scope (MAJOR 1)', async () => {
      const db = database();
      await db.organization.update({
        data: { billingAccountId: billingAccountIds[0] },
        where: { id: organizationIds[0] },
      });
      await db.creditBalance.create({
        data: {
          balance: 0,
          billingAccountId: billingAccountIds[0],
          heldAmount: 0,
          organizationId: organizationIds[0],
          version: 0,
        },
      });

      await runWithTenantContext(
        { organizationId: organizationIds[0] },
        async () => {
          const scope = await resolveBillingAccountAccess(
            organizationIds[0],
            guardedPrisma,
          );

          await expect(
            guardedPrisma.creditBalance.updateMany({
              data: { organizationId: organizationIds[1] },
              where: billingAccountScopedWhere(scope, {}),
            }),
          ).rejects.toBeInstanceOf(TenantIsolationError);
        },
      );
    });

    it('does not require a registered scope for a write already scoped by a matching organizationId (BLOCKER)', async () => {
      const db = database();
      await db.organization.update({
        data: { billingAccountId: billingAccountIds[0] },
        where: { id: organizationIds[0] },
      });
      await db.creditTransaction.create({
        data: {
          amount: 5,
          billingAccountId: null,
          category: 'ADD',
          isDeleted: false,
          organizationId: organizationIds[0],
        },
      });

      // No resolveBillingAccountAccess call anywhere in this test — the
      // write below must pass purely on its matching organizationId, the
      // same way credit-reservation.service.ts's settle() copies
      // reservation.billingAccountId into `data` alongside an
      // organization-scoped `where`.
      await runWithTenantContext(
        { organizationId: organizationIds[0] },
        async () => {
          const result = await guardedPrisma.creditTransaction.updateMany({
            data: { billingAccountId: billingAccountIds[0] },
            where: { isDeleted: false, organizationId: organizationIds[0] },
          });
          expect(result.count).toBe(1);
        },
      );
    });
  },
);
