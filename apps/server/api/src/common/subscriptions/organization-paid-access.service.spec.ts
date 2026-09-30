import { OrganizationPaidAccessService } from '@api/common/subscriptions/organization-paid-access.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  SubscriptionPlan,
  SubscriptionStatus,
  SubscriptionTier,
} from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';
import { ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const configMocks = vi.hoisted(() => ({
  hasOrganizationBilling: vi.fn(() => true),
}));

vi.mock('@genfeedai/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@genfeedai/config')>()),
  hasOrganizationBilling: configMocks.hasOrganizationBilling,
}));

const FUTURE = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

function activeSubscription(overrides: Record<string, unknown> = {}) {
  return {
    cancelAtPeriodEnd: false,
    currentPeriodEnd: FUTURE,
    plan: SubscriptionPlan.MONTHLY,
    status: SubscriptionStatus.ACTIVE,
    ...overrides,
  };
}

/**
 * A fake Prisma client shaped for both an organization's own subscription
 * read and the #5231 billing-account scope helper
 * (`resolveBillingAccountAccess`), which reads `organization`,
 * `billingAccountOrganization`, and `billingAccount` directly. Defaults to
 * "no billing account linked" so tests only need to override what they are
 * exercising. `billingAccount.planTier` is accepted for fixture realism
 * only — `OrganizationPaidAccessService` never reads it (see its class
 * doc); the tests below prove that directly.
 */
function createFakePrisma(overrides: {
  ownSubscriptions?: unknown[];
  ownSubscriptionTier?: string | null;
  organization?: { billingAccountId: string | null; isDeleted: boolean } | null;
  billingAccountOrganizationLinks?: Array<{ billingAccountId: string }>;
  billingAccount?: {
    id: string;
    isDeleted: boolean;
    planTier: string | null;
  } | null;
  billingAccountSubscriptions?: unknown[];
  ownSubscriptionReadFails?: boolean;
}) {
  const organization = overrides.organization ?? {
    billingAccountId: null,
    isDeleted: false,
  };
  const links = overrides.billingAccountOrganizationLinks ?? [];
  const billingAccount = overrides.billingAccount ?? null;

  const subscriptionFindMany = vi.fn(
    async (args: { where: Record<string, unknown> }) => {
      if (
        overrides.ownSubscriptionReadFails &&
        'organizationId' in args.where
      ) {
        throw new Error('db down');
      }
      if ('billingAccountId' in args.where) {
        return overrides.billingAccountSubscriptions ?? [];
      }
      return overrides.ownSubscriptions ?? [];
    },
  );

  return {
    billingAccount: {
      findFirst: vi.fn(async () => billingAccount),
    },
    billingAccountOrganization: {
      findMany: vi.fn(async () => links),
    },
    organization: {
      findFirst: vi.fn(async () => organization),
    },
    organizationSetting: {
      findFirst: vi.fn(async () => ({
        subscriptionTier: overrides.ownSubscriptionTier ?? null,
      })),
    },
    subscription: {
      findMany: subscriptionFindMany,
    },
  };
}

function createService(prisma: ReturnType<typeof createFakePrisma>) {
  const logger = { warn: vi.fn() };
  const service = new OrganizationPaidAccessService(
    prisma as unknown as PrismaService,
    logger as unknown as LoggerService,
  );
  return { logger, service };
}

describe('OrganizationPaidAccessService', () => {
  beforeEach(() => {
    configMocks.hasOrganizationBilling.mockReturnValue(true);
  });

  it("grants access from the organization's own active subscription", async () => {
    const prisma = createFakePrisma({
      ownSubscriptions: [activeSubscription()],
    });
    const { service } = createService(prisma);

    await expect(service.hasPaidSubscription('org-1')).resolves.toBe(true);
    await expect(service.isSubscriptionGated('org-1')).resolves.toBe(false);
    // The organization's own row already grants access — the billing
    // account round trip must not run.
    expect(prisma.organization.findFirst).not.toHaveBeenCalled();
  });

  it('grants access through a linked billing account subscription (#5293)', async () => {
    const prisma = createFakePrisma({
      billingAccount: {
        id: 'ba-1',
        isDeleted: false,
        planTier: null,
      },
      billingAccountSubscriptions: [activeSubscription()],
      organization: { billingAccountId: 'ba-1', isDeleted: false },
      ownSubscriptions: [],
    });
    const { service } = createService(prisma);

    await expect(service.hasPaidSubscription('org-1')).resolves.toBe(true);
  });

  it("does not grant access from a linked billing account's own planTier when it has no subscription row (adversarial check, #5293)", async () => {
    // BillingAccount.planTier has no write discipline: nothing keeps it in
    // sync after the account is created, and the #5231 migration froze every
    // pre-existing organization's personal billing account at its
    // then-current tier. Trusting it here would let a churned organization
    // whose billing account predates that migration keep paid access
    // forever once its subscription rows are gone — unlike an
    // organization's own `subscriptionTier`, which a superadmin explicitly
    // controls and which the cancellation webhook resets to `free` in the
    // same call that removes the row.
    const prisma = createFakePrisma({
      billingAccount: {
        id: 'ba-1',
        isDeleted: false,
        planTier: SubscriptionTier.ENTERPRISE,
      },
      billingAccountSubscriptions: [],
      organization: { billingAccountId: 'ba-1', isDeleted: false },
      ownSubscriptions: [],
    });
    const { logger, service } = createService(prisma);

    await expect(service.hasPaidSubscription('org-1')).resolves.toBe(false);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("does not grant access from a linked billing account's planTier even alongside its own expired subscription row (adversarial check, #5293)", async () => {
    const PAST = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const prisma = createFakePrisma({
      billingAccount: {
        id: 'ba-1',
        isDeleted: false,
        planTier: SubscriptionTier.ENTERPRISE,
      },
      billingAccountSubscriptions: [
        activeSubscription({
          currentPeriodEnd: PAST,
          status: SubscriptionStatus.CANCELLED,
        }),
      ],
      organization: { billingAccountId: 'ba-1', isDeleted: false },
      ownSubscriptions: [],
    });
    const { service } = createService(prisma);

    await expect(service.hasPaidSubscription('org-1')).resolves.toBe(false);
  });

  it('grants access through a billing account linked via billingAccountOrganization (no direct FK)', async () => {
    const prisma = createFakePrisma({
      billingAccount: {
        id: 'ba-2',
        isDeleted: false,
        planTier: null,
      },
      billingAccountOrganizationLinks: [{ billingAccountId: 'ba-2' }],
      billingAccountSubscriptions: [activeSubscription()],
      organization: { billingAccountId: null, isDeleted: false },
      ownSubscriptions: [],
    });
    const { service } = createService(prisma);

    await expect(service.hasPaidSubscription('org-1')).resolves.toBe(true);
  });

  it('grants access from an operator-granted tier with no subscription row at all (#5293)', async () => {
    const prisma = createFakePrisma({
      ownSubscriptions: [],
      ownSubscriptionTier: SubscriptionTier.PRO,
    });
    const { service } = createService(prisma);

    await expect(service.hasPaidSubscription('org-1')).resolves.toBe(true);
    // The org's own tier already grants access — the billing account round
    // trip must not run either.
    expect(prisma.organization.findFirst).not.toHaveBeenCalled();
  });

  it('denies an organization with no subscription, no tier, and no billing account', async () => {
    const prisma = createFakePrisma({
      ownSubscriptions: [],
      ownSubscriptionTier: null,
    });
    const { logger, service } = createService(prisma);

    await expect(service.hasPaidSubscription('org-1')).resolves.toBe(false);
    await expect(service.isSubscriptionGated('org-1')).resolves.toBe(true);
    // Not linked is the common case, not a lookup failure.
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('never gates a deployment without organization billing', async () => {
    configMocks.hasOrganizationBilling.mockReturnValue(false);
    const prisma = createFakePrisma({ ownSubscriptions: [] });
    const { service } = createService(prisma);

    await expect(service.isSubscriptionGated('org-1')).resolves.toBe(false);
    expect(prisma.subscription.findMany).not.toHaveBeenCalled();
  });

  it("fails closed when the organization's own subscription read errors", async () => {
    const prisma = createFakePrisma({
      ownSubscriptionReadFails: true,
      ownSubscriptions: [],
    });
    const { logger, service } = createService(prisma);

    await expect(service.hasPaidSubscription('org-1')).resolves.toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('subscription read failed'),
      expect.objectContaining({ organizationId: 'org-1' }),
    );

    // Not cached: a retry re-reads instead of reusing the failed result.
    await service.hasPaidSubscription('org-1');
    expect(prisma.subscription.findMany).toHaveBeenCalledTimes(2);
  });

  it('fails closed when the billing-account lookup errors (ambiguous multiple links)', async () => {
    const prisma = createFakePrisma({
      billingAccountOrganizationLinks: [
        { billingAccountId: 'ba-1' },
        { billingAccountId: 'ba-2' },
      ],
      organization: { billingAccountId: null, isDeleted: false },
      ownSubscriptions: [],
    });
    const { logger, service } = createService(prisma);

    await expect(service.hasPaidSubscription('org-1')).resolves.toBe(false);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('caches a granted decision for the TTL window', async () => {
    const prisma = createFakePrisma({
      ownSubscriptions: [activeSubscription()],
    });
    const { service } = createService(prisma);

    await service.hasPaidSubscription('org-1');
    await service.hasPaidSubscription('org-1');

    expect(prisma.subscription.findMany).toHaveBeenCalledTimes(1);
  });

  it('exposes ConflictException as a real thrown type from the ambiguous-link path', async () => {
    // Sanity check on the fixture itself: an ambiguous multi-link
    // organization is a genuine data-integrity conflict, not a "not
    // linked" outcome, so it must not be swallowed as a soft no-grant.
    const prisma = createFakePrisma({
      billingAccountOrganizationLinks: [
        { billingAccountId: 'ba-1' },
        { billingAccountId: 'ba-2' },
      ],
      organization: { billingAccountId: null, isDeleted: false },
    });
    const { resolveBillingAccountAccess } = await import('@api/index');
    await expect(
      resolveBillingAccountAccess('org-1', prisma as never),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
