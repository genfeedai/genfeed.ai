import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { CustomersService } from '@api/collections/customers/services/customers.service';
import type { SubscriptionCreditGrantService } from '@api/common/subscriptions/subscription-credit-grant.service';
import type { StripeService } from '@api/services/integrations/stripe/services/stripe.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { SubscriptionStatus } from '@genfeedai/contracts';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SubscriptionsService } from './subscriptions.service';

type MockFn = ReturnType<typeof vi.fn>;

interface PrismaFixture {
  billingAccountOrganization: { findMany: MockFn };
  creditBalance: { findMany: MockFn };
  organization: { count: MockFn; findMany: MockFn };
  organizationSetting: { findMany: MockFn };
  subscription: { findMany: MockFn };
}

describe('SubscriptionsService.findAdminBilling', () => {
  let prisma: PrismaFixture;
  let creditGrantService: {
    resolveMonthlyCredits: MockFn;
    resolveTierFromPriceId: MockFn;
  };
  let service: SubscriptionsService;

  beforeEach(() => {
    prisma = {
      billingAccountOrganization: { findMany: vi.fn().mockResolvedValue([]) },
      creditBalance: { findMany: vi.fn().mockResolvedValue([]) },
      organization: {
        count: vi.fn().mockResolvedValue(0),
        findMany: vi.fn().mockResolvedValue([]),
      },
      organizationSetting: { findMany: vi.fn().mockResolvedValue([]) },
      subscription: { findMany: vi.fn().mockResolvedValue([]) },
    };
    creditGrantService = {
      resolveMonthlyCredits: vi.fn().mockResolvedValue(null),
      resolveTierFromPriceId: vi.fn().mockReturnValue(null),
    };

    service = new SubscriptionsService(
      prisma as unknown as PrismaService,
      {
        debug: vi.fn(),
        error: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
      } as unknown as LoggerService,
      creditGrantService as unknown as SubscriptionCreditGrantService,
      {} as StripeService,
      {} as CustomersService,
      {} as CreditsUtilsService,
    );
  });

  function organization(
    id: string,
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> {
    return {
      billingAccountId: null,
      id,
      label: `Org ${id}`,
      user: { email: `${id}@example.com` },
      ...overrides,
    };
  }

  it('lists organizations that have no subscription as free with their own balance', async () => {
    prisma.organization.findMany.mockResolvedValue([organization('org_free')]);
    prisma.organization.count.mockResolvedValue(51);
    prisma.creditBalance.findMany.mockResolvedValue([
      {
        balance: 500,
        billingAccountId: null,
        heldAmount: 100,
        organizationId: 'org_free',
      },
    ]);

    const result = await service.findAdminBilling({ limit: 15, page: 3 });

    expect(prisma.organization.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 30,
        take: 15,
        where: { isDeleted: false },
      }),
    );
    expect(result).toMatchObject({
      limit: 15,
      page: 3,
      totalDocs: 51,
      totalPages: 4,
    });
    expect(result.docs).toEqual([
      expect.objectContaining({
        balance: 400,
        hasSubscription: false,
        organizationId: 'org_free',
        organizationName: 'Org org_free',
        ownerEmail: 'org_free@example.com',
        planLimit: 0,
        status: null,
        stripeCustomerId: null,
        tier: 'free',
      }),
    ]);
  });

  it('joins the newest subscription, its customer and the plan allotment', async () => {
    prisma.organization.findMany.mockResolvedValue([organization('org_paid')]);
    prisma.organization.count.mockResolvedValue(1);
    prisma.subscription.findMany.mockResolvedValue([
      {
        currentPeriodEnd: new Date('2026-11-11T00:00:00.000Z'),
        customer: { stripeCustomerId: 'cus_new' },
        organizationId: 'org_paid',
        plan: 'monthly',
        status: 'TRIALING',
        stripePriceId: 'price_scale',
        stripeSubscriptionId: 'sub_new',
      },
      {
        currentPeriodEnd: null,
        customer: { stripeCustomerId: 'cus_old' },
        organizationId: 'org_paid',
        plan: 'monthly',
        status: 'CANCELLED',
        stripePriceId: 'price_old',
        stripeSubscriptionId: 'sub_old',
      },
    ]);
    creditGrantService.resolveMonthlyCredits.mockResolvedValue(60_000);
    creditGrantService.resolveTierFromPriceId.mockReturnValue('scale');
    prisma.creditBalance.findMany.mockResolvedValue([
      {
        balance: 30_000,
        billingAccountId: null,
        heldAmount: 0,
        organizationId: 'org_paid',
      },
    ]);

    const result = await service.findAdminBilling({ limit: 15, page: 1 });

    expect(creditGrantService.resolveMonthlyCredits).toHaveBeenCalledWith(
      'price_scale',
    );
    expect(result.docs[0]).toEqual(
      expect.objectContaining({
        currentPeriodEnd: '2026-11-11T00:00:00.000Z',
        hasSubscription: true,
        isMaxedOut: false,
        planLimit: 60_000,
        status: SubscriptionStatus.TRIALING,
        stripeCustomerId: 'cus_new',
        stripeSubscriptionId: 'sub_new',
        tier: 'scale',
        usedCredits: 30_000,
      }),
    );
    expect(result.docs[0]?.usedPercent).toBeCloseTo(50, 5);
  });

  it('falls back to the stored tier when the price maps to none', async () => {
    prisma.organization.findMany.mockResolvedValue([organization('org_tier')]);
    prisma.organizationSetting.findMany.mockResolvedValue([
      { organizationId: 'org_tier', subscriptionTier: 'enterprise' },
    ]);

    const result = await service.findAdminBilling({ limit: 15, page: 1 });

    expect(result.docs[0]?.tier).toBe('enterprise');
  });

  it('reads the shared wallet of a billing account the organization is attached to', async () => {
    prisma.organization.findMany.mockResolvedValue([
      organization('org_direct', { billingAccountId: 'ba_1' }),
      organization('org_linked'),
    ]);
    prisma.billingAccountOrganization.findMany.mockResolvedValue([
      { billingAccountId: 'ba_1', organizationId: 'org_linked' },
    ]);
    prisma.creditBalance.findMany.mockResolvedValue([
      {
        balance: 900,
        billingAccountId: 'ba_1',
        heldAmount: 0,
        organizationId: 'org_other',
      },
    ]);

    const result = await service.findAdminBilling({ limit: 15, page: 1 });

    expect(result.docs.map((row) => row.balance)).toEqual([900, 900]);
    expect(prisma.creditBalance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          isDeleted: false,
          OR: [
            { organizationId: { in: ['org_direct', 'org_linked'] } },
            { billingAccountId: { in: ['ba_1'] } },
          ],
        },
      }),
    );
  });

  it('reports a zero balance, never creating a wallet, when none exists', async () => {
    prisma.organization.findMany.mockResolvedValue([organization('org_empty')]);

    const result = await service.findAdminBilling({ limit: 15, page: 1 });

    expect(result.docs[0]?.balance).toBe(0);
  });

  it('skips every dependent lookup on an empty page', async () => {
    const result = await service.findAdminBilling({ limit: 15, page: 9 });

    expect(result.docs).toEqual([]);
    expect(result.totalPages).toBe(1);
    expect(prisma.subscription.findMany).not.toHaveBeenCalled();
    expect(prisma.creditBalance.findMany).not.toHaveBeenCalled();
  });
});
