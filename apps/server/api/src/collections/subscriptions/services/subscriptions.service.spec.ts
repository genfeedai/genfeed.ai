import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { CustomersService } from '@api/collections/customers/services/customers.service';
import type { OrganizationDocument } from '@api/collections/organizations/schemas/organization.schema';
import type { SubscriptionDocument } from '@api/collections/subscriptions/schemas/subscription.schema';
import type { SubscriptionCreditGrantService } from '@api/common/subscriptions/subscription-credit-grant.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type {
  StripeCustomer,
  StripeService,
  StripeSubscription,
} from '@api/services/integrations/stripe/services/stripe.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { SubscriptionPlan, SubscriptionStatus } from '@genfeedai/contracts';
import type { ISubscriptionOssReadModel } from '@genfeedai/contracts/interfaces/billing';
import { Prisma } from '@genfeedai/prisma';
import type { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { SubscriptionsService } from './subscriptions.service';

type MockFn = ReturnType<typeof vi.fn>;

/** The customer row shape the provisioning helper below reads back. */
interface CustomerRowFixture {
  id: string;
  stripeCustomerId: string | null;
}

interface Delegate {
  count: MockFn;
  create: MockFn;
  findFirst: MockFn;
  findMany: MockFn;
  update: MockFn;
  updateMany: MockFn;
}

function createDelegate(): Delegate {
  return {
    count: vi.fn().mockResolvedValue(0),
    create: vi.fn(),
    findFirst: vi.fn().mockResolvedValue(null),
    findMany: vi.fn().mockResolvedValue([]),
    update: vi.fn(),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
  };
}

const ORGANIZATION_ID = 'org_1';

function buildSubscription(
  overrides: Partial<SubscriptionDocument> = {},
): SubscriptionDocument {
  return {
    billingAccountId: null,
    cancelAtPeriodEnd: false,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    currentPeriodEnd: new Date('2026-02-01T00:00:00.000Z'),
    currentPeriodStart: new Date('2026-01-01T00:00:00.000Z'),
    customerId: 'cust_row_1',
    id: 'sub_row_1',
    isDeleted: false,
    organizationId: ORGANIZATION_ID,
    plan: SubscriptionPlan.MONTHLY,
    status: SubscriptionStatus.ACTIVE,
    stripePriceId: 'price_monthly',
    stripeSubscriptionId: 'sub_stripe_1',
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    userId: 'user_1',
    ...overrides,
  };
}

/** Minimal Stripe subscription shape the service actually reads. */
function buildStripeSubscription(options: {
  currentPeriodEnd?: number | null;
  interval?: 'month' | 'year' | null;
  priceId?: string;
  status?: string;
  unitAmount?: number | null;
}): StripeSubscription {
  return {
    id: 'sub_stripe_1',
    items: {
      data: [
        {
          current_period_end: options.currentPeriodEnd ?? null,
          id: 'si_1',
          price: {
            currency: 'usd',
            id: options.priceId ?? 'price_monthly',
            recurring:
              options.interval === null
                ? null
                : {
                    interval: options.interval ?? 'month',
                    interval_count: 1,
                  },
            unit_amount:
              options.unitAmount === undefined ? 4900 : options.unitAmount,
          },
        },
      ],
    },
    status: options.status ?? 'active',
  } as unknown as StripeSubscription;
}

describe('SubscriptionsService', () => {
  let subscriptionDelegate: Delegate;
  let customerDelegate: { findFirst: MockFn };
  let organizationSettingDelegate: { updateMany: MockFn };
  let stripeService: {
    changeSubscriptionPlan: MockFn;
    createOrganizationCustomer: MockFn;
    getPrice: MockFn;
    getSubscription: MockFn;
    getUpcomingInvoice: MockFn;
    retrieveCustomer: MockFn;
  };
  let customersService: {
    findByOrganizationId: Mock<
      (organizationId: string) => Promise<CustomerRowFixture | null>
    >;
    findByStripeCustomerId: MockFn;
    patch: Mock<
      (
        id: string,
        data: { stripeCustomerId: string },
      ) => Promise<CustomerRowFixture>
    >;
    provisionForOrganization: MockFn;
    upsertForOrganization: Mock<
      (
        organizationId: string,
        stripeCustomerId: string,
      ) => Promise<CustomerRowFixture>
    >;
  };
  let creditsUtilsService: { resetOrganizationCredits: MockFn };
  let creditGrantService: {
    logUnresolvedGrant: MockFn;
    resolveMonthlyCredits: MockFn;
    resolvePlanCredits: MockFn;
    resolveTierFromPriceId: MockFn;
  };
  let logger: { debug: MockFn; error: MockFn; log: MockFn; warn: MockFn };
  let service: SubscriptionsService;

  beforeEach(() => {
    subscriptionDelegate = createDelegate();
    customerDelegate = { findFirst: vi.fn().mockResolvedValue(null) };
    organizationSettingDelegate = {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    };
    stripeService = {
      changeSubscriptionPlan: vi.fn(),
      createOrganizationCustomer: vi.fn(),
      getPrice: vi.fn().mockResolvedValue({
        id: 'price_monthly',
        recurring: { interval: 'month' },
      }),
      getSubscription: vi.fn(),
      getUpcomingInvoice: vi.fn(),
      retrieveCustomer: vi.fn(),
    };
    customersService = {
      findByOrganizationId: vi.fn().mockResolvedValue(null),
      findByStripeCustomerId: vi.fn().mockResolvedValue(null),
      patch: vi.fn(),
      provisionForOrganization: vi.fn(
        async (
          organizationId: string,
          provision: (current: string | null) => Promise<string>,
        ) => {
          const current =
            await customersService.findByOrganizationId(organizationId);
          const stripeCustomerId = await provision(
            current?.stripeCustomerId ?? null,
          );
          if (current) {
            if (current.stripeCustomerId === stripeCustomerId) {
              return current;
            }
            return await customersService.patch(String(current.id), {
              stripeCustomerId,
            });
          }
          return await customersService.upsertForOrganization(
            organizationId,
            stripeCustomerId,
          );
        },
      ),
      upsertForOrganization: vi.fn(),
    };
    creditsUtilsService = { resetOrganizationCredits: vi.fn() };
    creditGrantService = {
      logUnresolvedGrant: vi.fn(),
      resolveMonthlyCredits: vi.fn().mockResolvedValue(null),
      resolvePlanCredits: vi.fn().mockResolvedValue(null),
      resolveTierFromPriceId: vi.fn().mockReturnValue(null),
    };
    logger = {
      debug: vi.fn(),
      error: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    };

    service = new SubscriptionsService(
      {
        customer: customerDelegate,
        organizationSetting: organizationSettingDelegate,
        subscription: subscriptionDelegate,
      } as unknown as PrismaService,
      logger as unknown as LoggerService,
      creditGrantService as unknown as SubscriptionCreditGrantService,
      stripeService as unknown as StripeService,
      customersService as unknown as CustomersService,
      creditsUtilsService as unknown as CreditsUtilsService,
    );
  });

  describe('findAll', () => {
    it('mirrors totalDocs onto the interface-mandated `total` field', async () => {
      const row = buildSubscription();
      subscriptionDelegate.findMany.mockResolvedValue([row]);
      subscriptionDelegate.count.mockResolvedValue(1);

      const result = await service.findAll(
        { where: { isDeleted: false, organizationId: ORGANIZATION_ID } },
        { limit: 20, page: 1 },
        false,
      );

      expect(result.total).toBe(1);
      expect(result.totalDocs).toBe(1);
      expect(result.docs).toEqual([row]);
      const findManyArgs = subscriptionDelegate.findMany.mock.calls[0] as [
        { where: Record<string, unknown> },
      ];
      expect(findManyArgs[0].where).toEqual(
        expect.objectContaining({
          isDeleted: false,
          organizationId: ORGANIZATION_ID,
        }),
      );
    });
  });

  describe('syncSubscriptionState', () => {
    it('persists the tier onto OrganizationSetting scoped to the organization', async () => {
      await service.syncSubscriptionState(
        buildSubscription(),
        'sub_stripe_1',
        'price_pro',
        'active',
        'pro',
      );

      expect(organizationSettingDelegate.updateMany).toHaveBeenCalledWith({
        data: { subscriptionTier: 'pro' },
        where: { organizationId: ORGANIZATION_ID },
      });
      expect(logger.log).toHaveBeenCalledWith(
        'Subscription tier persisted to DB',
        { organizationId: ORGANIZATION_ID, subscriptionTier: 'pro' },
      );
    });

    it('skips the write when there is no tier to persist', async () => {
      await service.syncSubscriptionState(buildSubscription());

      expect(organizationSettingDelegate.updateMany).not.toHaveBeenCalled();
      expect(logger.log).toHaveBeenCalledWith(
        'Subscription state sync skipped (no tier to write)',
        expect.objectContaining({
          hasOrganizationId: true,
          hasSubscriptionTier: false,
        }),
      );
    });

    it('skips the write when the subscription is null', async () => {
      await service.syncSubscriptionState(null, undefined, undefined, 'active');

      expect(organizationSettingDelegate.updateMany).not.toHaveBeenCalled();
    });

    it('never lets a persistence failure escape into the billing flow', async () => {
      organizationSettingDelegate.updateMany.mockRejectedValue(
        new Error('db down'),
      );

      await expect(
        service.syncSubscriptionState(
          buildSubscription(),
          undefined,
          undefined,
          undefined,
          'scale',
        ),
      ).resolves.toBeUndefined();
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to sync subscription state to DB',
        expect.any(Error),
      );
    });
  });

  describe('createForOrganization', () => {
    const organization = {
      id: ORGANIZATION_ID,
      label: 'Acme Inc',
    } as unknown as OrganizationDocument;

    it('creates a Stripe customer and an INCOMPLETE monthly subscription when none exists', async () => {
      customersService.findByOrganizationId.mockResolvedValue(null);
      stripeService.createOrganizationCustomer.mockResolvedValue({
        id: 'cus_new',
      } as unknown as StripeCustomer);
      customersService.upsertForOrganization.mockResolvedValue({
        id: 'cust_row_new',
        stripeCustomerId: 'cus_new',
      });
      subscriptionDelegate.create.mockResolvedValue(
        buildSubscription({ id: 'sub_created' }),
      );

      const result = await service.createForOrganization(
        organization,
        'billing@acme.test',
        'user_1',
      );

      expect(stripeService.createOrganizationCustomer).toHaveBeenCalledWith(
        'Acme Inc',
        'billing@acme.test',
        ORGANIZATION_ID,
        'user_1',
        null,
      );
      expect(customersService.upsertForOrganization).toHaveBeenCalledWith(
        ORGANIZATION_ID,
        'cus_new',
      );
      const createArgs = subscriptionDelegate.create.mock.calls[0] as [
        { data: Record<string, unknown> },
      ];
      expect(createArgs[0].data).toEqual(
        expect.objectContaining({
          customerId: 'cust_row_new',
          organizationId: ORGANIZATION_ID,
          plan: SubscriptionPlan.MONTHLY,
          status: SubscriptionStatus.INCOMPLETE,
          userId: 'user_1',
        }),
      );
      expect(result.id).toBe('sub_created');
    });

    it('reuses an existing customer whose Stripe record still resolves', async () => {
      customersService.findByOrganizationId.mockResolvedValue({
        id: 'cust_row_1',
        stripeCustomerId: 'cus_existing',
      });
      stripeService.retrieveCustomer.mockResolvedValue({
        id: 'cus_existing',
      } as unknown as StripeCustomer);
      subscriptionDelegate.create.mockResolvedValue(buildSubscription());

      await service.createForOrganization(
        organization,
        'billing@acme.test',
        'user_1',
      );

      expect(stripeService.retrieveCustomer).toHaveBeenCalledWith(
        'cus_existing',
      );
      expect(stripeService.createOrganizationCustomer).not.toHaveBeenCalled();
      expect(customersService.upsertForOrganization).not.toHaveBeenCalled();
    });

    it('re-creates the Stripe customer and repoints the local row when Stripe no longer has it', async () => {
      customersService.findByOrganizationId.mockResolvedValue({
        id: 'cust_row_1',
        stripeCustomerId: 'cus_stale',
      });
      stripeService.retrieveCustomer.mockResolvedValue(null);
      stripeService.createOrganizationCustomer.mockResolvedValue({
        id: 'cus_fresh',
      } as unknown as StripeCustomer);
      customersService.patch.mockResolvedValue({
        id: 'cust_row_1',
        stripeCustomerId: 'cus_fresh',
      });
      subscriptionDelegate.create.mockResolvedValue(buildSubscription());

      await service.createForOrganization(
        organization,
        'billing@acme.test',
        'user_1',
      );

      expect(customersService.patch).toHaveBeenCalledWith('cust_row_1', {
        stripeCustomerId: 'cus_fresh',
      });
    });

    it('returns the freshly created subscription carrying the derived stripeCustomerId', async () => {
      // Regression: `stripeCustomerId` is derived from the customer row, never
      // persisted on the subscription. `BaseService.create` skipped that
      // resolution, so callers read `undefined`, concluded the org had no
      // Stripe customer, and created a second one on every first checkout.
      customersService.findByOrganizationId.mockResolvedValue(null);
      stripeService.createOrganizationCustomer.mockResolvedValue({
        id: 'cus_new',
      } as unknown as StripeCustomer);
      customersService.upsertForOrganization.mockResolvedValue({
        id: 'cust_row_new',
        stripeCustomerId: 'cus_new',
      });
      subscriptionDelegate.create.mockResolvedValue(
        buildSubscription({ customerId: 'cust_row_new', id: 'sub_created' }),
      );
      customerDelegate.findFirst.mockResolvedValue({
        stripeCustomerId: 'cus_new',
      });

      const result = await service.createForOrganization(
        organization,
        'billing@acme.test',
        'user_1',
      );

      expect(result.stripeCustomerId).toBe('cus_new');
      expect(customerDelegate.findFirst).toHaveBeenCalledWith({
        select: { stripeCustomerId: true },
        where: {
          id: 'cust_row_new',
          isDeleted: false,
          organizationId: ORGANIZATION_ID,
        },
      });
      expect(stripeService.createOrganizationCustomer).toHaveBeenCalledTimes(1);
    });

    it('provisions an existing customer row that carries no Stripe customer id', async () => {
      customersService.findByOrganizationId.mockResolvedValue({
        id: 'cust_row_1',
        stripeCustomerId: null,
      });
      stripeService.createOrganizationCustomer.mockResolvedValue({
        id: 'cus_new',
      } as unknown as StripeCustomer);
      customersService.patch.mockResolvedValue({
        id: 'cust_row_1',
        stripeCustomerId: 'cus_new',
      });
      subscriptionDelegate.create.mockResolvedValue(buildSubscription());

      await service.createForOrganization(
        organization,
        'billing@acme.test',
        'user_1',
      );

      expect(stripeService.createOrganizationCustomer).toHaveBeenCalledWith(
        'Acme Inc',
        'billing@acme.test',
        ORGANIZATION_ID,
        'user_1',
        null,
      );
    });

    it('returns the winning row when a concurrent checkout wins the subscription insert race', async () => {
      // Partial unique index `subscriptions_organizationId_active_key`
      // guarantees one active subscription row per org; the losing insert
      // converges on the winner instead of surfacing a 500.
      customersService.findByOrganizationId.mockResolvedValue(null);
      stripeService.createOrganizationCustomer.mockResolvedValue({
        id: 'cus_new',
      } as unknown as StripeCustomer);
      customersService.upsertForOrganization.mockResolvedValue({
        id: 'cust_row_new',
        stripeCustomerId: 'cus_new',
      });
      subscriptionDelegate.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          clientVersion: 'test',
          code: 'P2002',
        }),
      );
      subscriptionDelegate.findFirst.mockResolvedValue(
        buildSubscription({ id: 'sub_winner' }),
      );
      customerDelegate.findFirst.mockResolvedValue({
        stripeCustomerId: 'cus_new',
      });

      const result = await service.createForOrganization(
        organization,
        'billing@acme.test',
        'user_1',
      );

      expect(result.id).toBe('sub_winner');
    });

    it('rethrows a non-P2002 subscription insert failure even when a row exists', async () => {
      customersService.findByOrganizationId.mockResolvedValue(null);
      stripeService.createOrganizationCustomer.mockResolvedValue({
        id: 'cus_new',
      } as unknown as StripeCustomer);
      customersService.upsertForOrganization.mockResolvedValue({
        id: 'cust_row_new',
        stripeCustomerId: 'cus_new',
      });
      subscriptionDelegate.create.mockRejectedValue(new Error('db down'));
      subscriptionDelegate.findFirst.mockResolvedValue(
        buildSubscription({ id: 'unrelated_existing_row' }),
      );

      await expect(
        service.createForOrganization(
          organization,
          'billing@acme.test',
          'user_1',
        ),
      ).rejects.toThrow('db down');
    });
  });

  describe('findByOrganizationId', () => {
    it('scopes the lookup by organization and live rows only', async () => {
      subscriptionDelegate.findFirst.mockResolvedValue(
        buildSubscription({ customerId: null }),
      );

      const result = await service.findByOrganizationId(ORGANIZATION_ID);

      expect(subscriptionDelegate.findFirst).toHaveBeenCalledWith({
        where: { isDeleted: false, organizationId: ORGANIZATION_ID },
      });
      expect(result?.stripeCustomerId).toBeUndefined();
      expect(customerDelegate.findFirst).not.toHaveBeenCalled();
    });

    it('derives stripeCustomerId from the related customer row', async () => {
      subscriptionDelegate.findFirst.mockResolvedValue(buildSubscription());
      customerDelegate.findFirst.mockResolvedValue({
        stripeCustomerId: 'cus_1',
      });

      const result = await service.findByOrganizationId(ORGANIZATION_ID);

      expect(customerDelegate.findFirst).toHaveBeenCalledWith({
        select: { stripeCustomerId: true },
        where: {
          id: 'cust_row_1',
          isDeleted: false,
          organizationId: ORGANIZATION_ID,
        },
      });
      expect(result?.stripeCustomerId).toBe('cus_1');
    });

    it('returns null when the organization has no subscription', async () => {
      subscriptionDelegate.findFirst.mockResolvedValue(null);

      await expect(
        service.findByOrganizationId(ORGANIZATION_ID),
      ).resolves.toBeNull();
    });
  });

  describe('findByStripeCustomerId', () => {
    it('resolves the customer row first, then its live subscription', async () => {
      customersService.findByStripeCustomerId.mockResolvedValue({
        id: 'cust_row_1',
        organizationId: 'org_1',
      });
      subscriptionDelegate.findFirst.mockResolvedValue(
        buildSubscription({ customerId: null }),
      );

      const result = await service.findByStripeCustomerId('cus_1');

      expect(subscriptionDelegate.findFirst).toHaveBeenCalledWith({
        where: {
          customerId: 'cust_row_1',
          isDeleted: false,
          organizationId: 'org_1',
        },
      });
      expect(result?.id).toBe('sub_row_1');
    });

    it('returns null when no customer matches the Stripe id', async () => {
      customersService.findByStripeCustomerId.mockResolvedValue(null);

      await expect(
        service.findByStripeCustomerId('cus_missing'),
      ).resolves.toBeNull();
      expect(subscriptionDelegate.findFirst).not.toHaveBeenCalled();
    });

    it('returns null when the customer exists but has no subscription', async () => {
      customersService.findByStripeCustomerId.mockResolvedValue({
        id: 'cust_row_1',
        organizationId: 'org_1',
      });
      subscriptionDelegate.findFirst.mockResolvedValue(null);

      await expect(service.findByStripeCustomerId('cus_1')).resolves.toBeNull();
    });
  });

  describe('syncWithStripe', () => {
    const readModel: ISubscriptionOssReadModel = buildSubscription();

    it('returns the subscription once the Stripe customer resolves', async () => {
      customerDelegate.findFirst.mockResolvedValue({
        stripeCustomerId: 'cus_1',
      });
      stripeService.retrieveCustomer.mockResolvedValue({
        id: 'cus_1',
      } as unknown as StripeCustomer);

      await expect(service.syncWithStripe(readModel)).resolves.toBe(readModel);
      expect(stripeService.retrieveCustomer).toHaveBeenCalledWith('cus_1');
    });

    it('throws NotFound when Stripe has no such customer', async () => {
      customerDelegate.findFirst.mockResolvedValue({
        stripeCustomerId: 'cus_1',
      });
      stripeService.retrieveCustomer.mockResolvedValue(null);

      await expect(service.syncWithStripe(readModel)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(logger.error).toHaveBeenCalled();
    });

    it('throws BadRequest when the subscription has no Stripe customer id', async () => {
      customerDelegate.findFirst.mockResolvedValue({
        stripeCustomerId: null,
      });

      await expect(service.syncWithStripe(readModel)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(stripeService.retrieveCustomer).not.toHaveBeenCalled();
    });
  });

  describe('changeSubscriptionPlan', () => {
    beforeEach(() => {
      subscriptionDelegate.findFirst.mockResolvedValue(
        buildSubscription({ customerId: null }),
      );
    });

    it('switches to yearly with prorations, persists the new period and resets credits', async () => {
      const periodEnd = Math.floor(
        new Date('2027-01-01T00:00:00.000Z').getTime() / 1000,
      );
      stripeService.changeSubscriptionPlan.mockResolvedValue(
        buildStripeSubscription({
          currentPeriodEnd: periodEnd,
          priceId: 'price_yearly_pro',
          status: 'active',
        }),
      );
      stripeService.getPrice.mockResolvedValue({
        id: 'price_yearly_pro',
        recurring: { interval: 'year' },
      });
      subscriptionDelegate.update.mockResolvedValue(
        buildSubscription({ plan: SubscriptionPlan.YEARLY }),
      );
      creditGrantService.resolvePlanCredits.mockResolvedValue(600_000);

      const result = await service.changeSubscriptionPlan(
        ORGANIZATION_ID,
        'price_yearly_pro',
      );

      expect(stripeService.changeSubscriptionPlan).toHaveBeenCalledWith(
        'sub_stripe_1',
        'price_yearly_pro',
        'create_prorations',
      );
      const updateArgs = subscriptionDelegate.update.mock.calls[0] as [
        { data: Record<string, unknown>; where: { id: string } },
      ];
      expect(updateArgs[0].where).toEqual({ id: 'sub_row_1' });
      expect(updateArgs[0].data).toEqual(
        expect.objectContaining({
          currentPeriodEnd: new Date('2027-01-01T00:00:00.000Z'),
          plan: SubscriptionPlan.YEARLY,
          status: SubscriptionStatus.ACTIVE,
          stripePriceId: 'price_yearly_pro',
        }),
      );
      expect(creditGrantService.resolvePlanCredits).toHaveBeenCalledWith(
        SubscriptionPlan.YEARLY,
        'price_yearly_pro',
      );
      expect(creditsUtilsService.resetOrganizationCredits).toHaveBeenCalledWith(
        ORGANIZATION_ID,
        600_000,
        'change_to_yearly',
        expect.stringContaining('monthly'),
      );
      expect(result).toEqual(
        expect.objectContaining({
          subscription: expect.objectContaining({
            plan: SubscriptionPlan.YEARLY,
          }),
        }),
      );
    });

    it('leaves the balance alone and warns when the new price has no resolvable grant', async () => {
      stripeService.getPrice.mockResolvedValue({
        id: 'price_year_2026',
        recurring: { interval: 'year' },
      });
      stripeService.changeSubscriptionPlan.mockResolvedValue(
        buildStripeSubscription({ priceId: 'price_annual' }),
      );
      subscriptionDelegate.update.mockResolvedValue(buildSubscription());

      await service.changeSubscriptionPlan(ORGANIZATION_ID, 'price_year_2026');

      // Resetting to a made-up default would overwrite a real balance with a
      // number the customer never bought; the plan change still goes through.
      expect(
        creditsUtilsService.resetOrganizationCredits,
      ).not.toHaveBeenCalled();
      expect(creditGrantService.logUnresolvedGrant).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          organizationId: ORGANIZATION_ID,
          stripePriceId: 'price_year_2026',
        }),
      );
    });

    it('resets to the monthly allocation when downgrading from yearly', async () => {
      subscriptionDelegate.findFirst.mockResolvedValue(
        buildSubscription({ customerId: null, plan: SubscriptionPlan.YEARLY }),
      );
      stripeService.changeSubscriptionPlan.mockResolvedValue(
        buildStripeSubscription({ status: 'trialing' }),
      );
      subscriptionDelegate.update.mockResolvedValue(buildSubscription());
      creditGrantService.resolvePlanCredits.mockResolvedValue(5_900);

      await service.changeSubscriptionPlan(
        ORGANIZATION_ID,
        'price_monthly_pro',
      );

      const updateArgs = subscriptionDelegate.update.mock.calls[0] as [
        { data: Record<string, unknown> },
      ];
      // An absent Stripe `current_period_end` is dropped from the patch rather
      // than written as null.
      expect(updateArgs[0].data).not.toHaveProperty('currentPeriodEnd');
      expect(updateArgs[0].data).toEqual(
        expect.objectContaining({
          plan: SubscriptionPlan.MONTHLY,
          status: SubscriptionStatus.TRIALING,
        }),
      );
      expect(creditsUtilsService.resetOrganizationCredits).toHaveBeenCalledWith(
        ORGANIZATION_ID,
        5_900,
        'change_to_monthly',
        expect.any(String),
      );
    });

    it('resets credits when a monthly Pro price changes to monthly Scale', async () => {
      stripeService.changeSubscriptionPlan.mockResolvedValue(
        buildStripeSubscription({ priceId: 'price_scale_monthly' }),
      );
      subscriptionDelegate.update.mockResolvedValue(
        buildSubscription({ stripePriceId: 'price_scale_monthly' }),
      );
      creditGrantService.resolvePlanCredits.mockResolvedValue(60_000);

      await service.changeSubscriptionPlan(
        ORGANIZATION_ID,
        'price_scale_monthly',
      );

      expect(creditsUtilsService.resetOrganizationCredits).toHaveBeenCalledWith(
        ORGANIZATION_ID,
        60_000,
        'change_to_monthly',
        expect.stringContaining('price'),
      );
    });

    it('resets credits when a monthly Scale price changes to monthly Pro', async () => {
      subscriptionDelegate.findFirst.mockResolvedValue(
        buildSubscription({ stripePriceId: 'price_scale_monthly' }),
      );
      stripeService.changeSubscriptionPlan.mockResolvedValue(
        buildStripeSubscription({ priceId: 'price_pro_monthly' }),
      );
      subscriptionDelegate.update.mockResolvedValue(
        buildSubscription({ stripePriceId: 'price_pro_monthly' }),
      );
      creditGrantService.resolvePlanCredits.mockResolvedValue(5_900);

      await service.changeSubscriptionPlan(
        ORGANIZATION_ID,
        'price_pro_monthly',
      );

      expect(creditsUtilsService.resetOrganizationCredits).toHaveBeenCalledWith(
        ORGANIZATION_ID,
        5_900,
        'change_to_monthly',
        expect.stringContaining('price'),
      );
    });

    it('does not reset credits when the Stripe price is unchanged', async () => {
      stripeService.changeSubscriptionPlan.mockResolvedValue(
        buildStripeSubscription({}),
      );
      subscriptionDelegate.update.mockResolvedValue(buildSubscription());

      await service.changeSubscriptionPlan(ORGANIZATION_ID, 'price_monthly');

      expect(
        creditsUtilsService.resetOrganizationCredits,
      ).not.toHaveBeenCalled();
    });

    it('persists yearly cadence for an opaque yearly Stripe price id', async () => {
      stripeService.getPrice.mockResolvedValue({
        id: 'price_opaque',
        recurring: { interval: 'year' },
      });
      stripeService.changeSubscriptionPlan.mockResolvedValue(
        buildStripeSubscription({ interval: 'year', priceId: 'price_opaque' }),
      );
      subscriptionDelegate.update.mockResolvedValue(
        buildSubscription({
          plan: SubscriptionPlan.YEARLY,
          stripePriceId: 'price_opaque',
        }),
      );
      creditGrantService.resolvePlanCredits.mockResolvedValue(70_800);

      await service.changeSubscriptionPlan(ORGANIZATION_ID, 'price_opaque');

      expect(stripeService.getPrice).toHaveBeenCalledWith('price_opaque');
      expect(creditGrantService.resolvePlanCredits).toHaveBeenCalledWith(
        SubscriptionPlan.YEARLY,
        'price_opaque',
      );
      const updateArgs = subscriptionDelegate.update.mock.calls[0] as [
        { data: Record<string, unknown> },
      ];
      expect(updateArgs[0].data.plan).toBe(SubscriptionPlan.YEARLY);
    });

    it('maps a Stripe US-spelled `canceled` status to the Prisma CANCELLED label', async () => {
      stripeService.changeSubscriptionPlan.mockResolvedValue(
        buildStripeSubscription({ status: 'canceled' }),
      );
      subscriptionDelegate.update.mockResolvedValue(buildSubscription());

      await service.changeSubscriptionPlan(
        ORGANIZATION_ID,
        'price_monthly_pro',
      );

      const updateArgs = subscriptionDelegate.update.mock.calls[0] as [
        { data: Record<string, unknown> },
      ];
      expect(updateArgs[0].data.status).toBe(SubscriptionStatus.CANCELLED);
    });

    it('throws NotFound when the organization has no subscription', async () => {
      subscriptionDelegate.findFirst.mockResolvedValue(null);

      await expect(
        service.changeSubscriptionPlan(ORGANIZATION_ID, 'price_new'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(stripeService.changeSubscriptionPlan).not.toHaveBeenCalled();
    });

    it('throws BadRequest when the local row has no Stripe subscription', async () => {
      subscriptionDelegate.findFirst.mockResolvedValue(
        buildSubscription({ customerId: null, stripeSubscriptionId: null }),
      );

      await expect(
        service.changeSubscriptionPlan(ORGANIZATION_ID, 'price_new'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('propagates a Stripe failure after logging it', async () => {
      stripeService.changeSubscriptionPlan.mockRejectedValue(
        new Error('card_declined'),
      );

      await expect(
        service.changeSubscriptionPlan(ORGANIZATION_ID, 'price_new'),
      ).rejects.toThrowError('card_declined');
      expect(logger.error).toHaveBeenCalled();
      expect(subscriptionDelegate.update).not.toHaveBeenCalled();
    });
  });

  describe('previewSubscriptionChange', () => {
    beforeEach(() => {
      subscriptionDelegate.findFirst.mockResolvedValue(buildSubscription());
      customerDelegate.findFirst.mockResolvedValue({
        stripeCustomerId: 'cus_1',
      });
      stripeService.getUpcomingInvoice.mockResolvedValue({
        amount_due: 32_500,
        currency: 'usd',
        lines: {
          data: [
            {
              amount: 15_000,
              description: 'Remaining time on Scale',
              parent: {
                subscription_item_details: { proration: true },
              },
            },
          ],
        },
      });
      stripeService.getSubscription.mockResolvedValue(
        buildStripeSubscription({ priceId: 'price_pro', unitAmount: 4_900 }),
      );
      stripeService.getPrice.mockImplementation((priceId: string) =>
        Promise.resolve({
          currency: 'usd',
          id: priceId,
          recurring: { interval: 'month', interval_count: 1 },
          unit_amount: priceId === 'price_monthly' ? 4_900 : 49_900,
        }),
      );
    });

    it('flags an upgrade and returns the Stripe-computed upcoming invoice', async () => {
      const preview = (await service.previewSubscriptionChange(
        ORGANIZATION_ID,
        'price_scale',
      )) as {
        isDowngrade: boolean;
        isUpgrade: boolean;
        prorationAmount: number;
        upcomingInvoice: { amount_due: number; currency: string };
      };

      expect(stripeService.getUpcomingInvoice).toHaveBeenCalledWith(
        'cus_1',
        'sub_stripe_1',
        'price_monthly',
        'price_scale',
      );
      expect(preview.prorationAmount).toBe(15_000);
      expect(preview.isUpgrade).toBe(true);
      expect(preview.isDowngrade).toBe(false);
      expect(preview.upcomingInvoice.amount_due).toBe(32_500);
      expect(preview.upcomingInvoice.currency).toBe('usd');
    });

    it('flags a downgrade when the new price is cheaper', async () => {
      stripeService.getPrice.mockImplementation((priceId: string) =>
        Promise.resolve({
          currency: 'usd',
          id: priceId,
          recurring: { interval: 'month', interval_count: 1 },
          unit_amount: priceId === 'price_monthly' ? 4_900 : 900,
        }),
      );
      stripeService.getUpcomingInvoice.mockResolvedValue({
        amount_due: 900,
        currency: 'usd',
        lines: {
          data: [
            {
              amount: -1_200,
              parent: {
                subscription_item_details: { proration: true },
              },
            },
          ],
        },
      });

      const preview = (await service.previewSubscriptionChange(
        ORGANIZATION_ID,
        'price_starter',
      )) as {
        isDowngrade: boolean;
        isUpgrade: boolean;
        prorationAmount: number;
      };

      expect(preview.isDowngrade).toBe(true);
      expect(preview.isUpgrade).toBe(false);
      expect(preview.prorationAmount).toBe(-1_200);
    });

    it('ignores non-proration invoice lines when classifying the change', async () => {
      stripeService.getPrice.mockImplementation((priceId: string) =>
        Promise.resolve({
          currency: 'usd',
          id: priceId,
          recurring: { interval: 'month', interval_count: 1 },
          unit_amount: 4_900,
        }),
      );
      stripeService.getUpcomingInvoice.mockResolvedValue({
        amount_due: 49_900,
        currency: 'usd',
        lines: {
          data: [
            {
              amount: 49_900,
              parent: {
                subscription_item_details: { proration: false },
              },
            },
          ],
        },
      });

      const preview = (await service.previewSubscriptionChange(
        ORGANIZATION_ID,
        'price_same',
      )) as {
        isDowngrade: boolean;
        isUpgrade: boolean;
        prorationAmount: number;
      };

      expect(preview.prorationAmount).toBe(0);
      expect(preview.isUpgrade).toBe(false);
      expect(preview.isDowngrade).toBe(false);
    });

    it('uses neutral classification when a price has no fixed unit amount', async () => {
      stripeService.getPrice.mockImplementation((priceId: string) =>
        Promise.resolve({
          currency: 'usd',
          id: priceId,
          recurring: { interval: 'month', interval_count: 1 },
          unit_amount: priceId === 'price_monthly' ? 4_900 : null,
        }),
      );

      const preview = await service.previewSubscriptionChange(
        ORGANIZATION_ID,
        'price_metered',
      );

      expect(preview.isUpgrade).toBe(false);
      expect(preview.isDowngrade).toBe(false);
    });

    it('uses neutral classification across incomparable billing intervals', async () => {
      stripeService.getPrice.mockImplementation((priceId: string) =>
        Promise.resolve({
          currency: 'usd',
          id: priceId,
          recurring: {
            interval: priceId === 'price_monthly' ? 'month' : 'year',
            interval_count: 1,
          },
          unit_amount: priceId === 'price_monthly' ? 4_900 : 49_000,
        }),
      );

      const preview = await service.previewSubscriptionChange(
        ORGANIZATION_ID,
        'price_yearly',
      );

      expect(preview.isUpgrade).toBe(false);
      expect(preview.isDowngrade).toBe(false);
    });

    it('flags a trial upgrade even when Stripe returns no proration lines', async () => {
      stripeService.getUpcomingInvoice.mockResolvedValue({
        amount_due: 0,
        currency: 'usd',
        lines: { data: [] },
      });

      const preview = (await service.previewSubscriptionChange(
        ORGANIZATION_ID,
        'price_scale',
      )) as {
        isDowngrade: boolean;
        isUpgrade: boolean;
        prorationAmount: number;
      };

      expect(preview.prorationAmount).toBe(0);
      expect(preview.isUpgrade).toBe(true);
      expect(preview.isDowngrade).toBe(false);
    });

    it('throws when the organization has no subscription', async () => {
      subscriptionDelegate.findFirst.mockResolvedValue(null);

      await expect(
        service.previewSubscriptionChange(ORGANIZATION_ID, 'price_new'),
      ).rejects.toThrowError('Subscription not found');
    });

    it('throws BadRequest when the local row has no Stripe subscription', async () => {
      subscriptionDelegate.findFirst.mockResolvedValue(
        buildSubscription({ stripeSubscriptionId: null }),
      );

      await expect(
        service.previewSubscriptionChange(ORGANIZATION_ID, 'price_new'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws BadRequest when the local row has no current Stripe price', async () => {
      subscriptionDelegate.findFirst.mockResolvedValue(
        buildSubscription({ stripePriceId: null }),
      );

      await expect(
        service.previewSubscriptionChange(ORGANIZATION_ID, 'price_new'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(stripeService.getUpcomingInvoice).not.toHaveBeenCalled();
    });

    it('throws BadRequest when no Stripe customer id can be resolved', async () => {
      customerDelegate.findFirst.mockResolvedValue({
        stripeCustomerId: null,
      });

      await expect(
        service.previewSubscriptionChange(ORGANIZATION_ID, 'price_new'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(stripeService.getUpcomingInvoice).not.toHaveBeenCalled();
    });

    it('propagates a Stripe preview failure after logging it', async () => {
      stripeService.getUpcomingInvoice.mockRejectedValue(
        new Error('stripe unavailable'),
      );

      await expect(
        service.previewSubscriptionChange(ORGANIZATION_ID, 'price_new'),
      ).rejects.toThrowError('stripe unavailable');
      expect(logger.error).toHaveBeenCalled();
    });
  });
});
