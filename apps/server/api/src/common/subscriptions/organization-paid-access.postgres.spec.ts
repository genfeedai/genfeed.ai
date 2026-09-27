import { randomUUID } from 'node:crypto';
import { OrganizationPaidAccessService } from '@api/common/subscriptions/organization-paid-access.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  BillingAccountOrganizationStatus,
  SubscriptionStatus,
  SubscriptionTier,
} from '@genfeedai/contracts';
import { PrismaClient } from '@genfeedai/prisma';
import type { ConfigService } from '@libs/config/config.service';
import { runWithTenantContext } from '@libs/prisma/tenant-context';
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

// Explicit opt-in only: use an isolated migrated database, never DATABASE_URL.
const connectionString = process.env.BILLING_ACCOUNT_SCOPE_TEST_DATABASE_URL;

/**
 * Real Prisma client + real Postgres, running through the actual
 * `$extends`-wrapped `PrismaService` (GENFEED_CLOUD=1) — proves the #5293
 * fix end to end, not just against mocks: an organization linked to a
 * billing account (#5231) is paid through that billing account's own
 * subscription row (owned by a *different* organization — the shape
 * billing accounts exist for) and through the billing account's own
 * `planTier` with no subscription row at all, exactly like the
 * organization's-own-tier fallback. An unrelated, unlinked organization
 * gets neither. Every read goes through `billingAccountScopedWhere`, so
 * this also proves the runtime tenant guard is actually satisfied by the
 * scope `resolveBillingAccountAccess`/`resolveLiveBillingAccount` register,
 * not merely that the mocked unit tests believe it would be.
 */
describe.skipIf(!connectionString)(
  'OrganizationPaidAccessService PostgreSQL end-to-end (#5293)',
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
    const service = new OrganizationPaidAccessService(
      guardedPrisma,
      logger as never,
    );

    let userId: string;
    let billingAccountId: string;
    let payerOrganizationId: string;
    let linkedOrganizationId: string;
    let unrelatedOrganizationId: string;

    beforeEach(async () => {
      const suffix = randomUUID();
      userId = `opa-pg-user-${suffix}`;
      billingAccountId = `opa-pg-ba-${suffix}`;
      payerOrganizationId = `opa-pg-org-payer-${suffix}`;
      linkedOrganizationId = `opa-pg-org-linked-${suffix}`;
      unrelatedOrganizationId = `opa-pg-org-unrelated-${suffix}`;

      const db = database();
      await db.user.create({ data: { handle: userId, id: userId } });
      await db.billingAccount.create({ data: { id: billingAccountId } });

      for (const organizationId of [
        payerOrganizationId,
        linkedOrganizationId,
        unrelatedOrganizationId,
      ]) {
        await db.organization.create({
          data: {
            id: organizationId,
            label: organizationId,
            slug: organizationId,
            userId,
          },
        });
      }

      // linkedOrganizationId is paid through the billing account, but the
      // subscription row itself belongs to payerOrganizationId — the exact
      // shape #5231's billing accounts exist for: one org's subscription
      // pays for every organization linked to the same account.
      await db.billingAccountOrganization.create({
        data: {
          billingAccountId,
          organizationId: linkedOrganizationId,
          status: BillingAccountOrganizationStatus.LINKED,
        },
      });

      await db.subscription.create({
        data: {
          billingAccountId,
          currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          organizationId: payerOrganizationId,
          plan: 'monthly',
          status: SubscriptionStatus.ACTIVE,
          userId,
        },
      });
    });

    afterEach(async () => {
      const db = database();
      await db.subscription.deleteMany({ where: { billingAccountId } });
      await db.billingAccountOrganization.deleteMany({
        where: { billingAccountId },
      });
      await db.organization.deleteMany({
        where: {
          id: {
            in: [
              payerOrganizationId,
              linkedOrganizationId,
              unrelatedOrganizationId,
            ],
          },
        },
      });
      await db.billingAccount.deleteMany({ where: { id: billingAccountId } });
      await db.user.deleteMany({ where: { id: userId } });
    });

    afterAll(async () => {
      await prisma?.$disconnect();
      await guardedPrisma.$disconnect();
    });

    it('grants paid access to an organization linked to a billing account whose subscription belongs to a different organization', async () => {
      await expect(
        runWithTenantContext({ organizationId: linkedOrganizationId }, () =>
          service.hasPaidSubscription(linkedOrganizationId),
        ),
      ).resolves.toBe(true);
    });

    it("grants paid access from the billing account's own planTier with no subscription row at all", async () => {
      const db = database();
      await db.subscription.deleteMany({ where: { billingAccountId } });
      await db.billingAccount.update({
        data: { planTier: SubscriptionTier.ENTERPRISE },
        where: { id: billingAccountId },
      });

      await expect(
        runWithTenantContext({ organizationId: linkedOrganizationId }, () =>
          service.hasPaidSubscription(linkedOrganizationId),
        ),
      ).resolves.toBe(true);
    });

    it('does not grant paid access to an unrelated organization with no billing account link', async () => {
      await expect(
        runWithTenantContext({ organizationId: unrelatedOrganizationId }, () =>
          service.hasPaidSubscription(unrelatedOrganizationId),
        ),
      ).resolves.toBe(false);
      expect(logger.warn).not.toHaveBeenCalled();
    });
  },
);
