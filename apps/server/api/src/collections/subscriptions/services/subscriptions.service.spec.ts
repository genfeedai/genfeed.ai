import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { CustomersService } from '@api/collections/customers/services/customers.service';
import type { OrganizationDocument } from '@api/collections/organizations/schemas/organization.schema';
import { SubscriptionChangeException } from '@api/collections/subscriptions/errors/subscription-change.exception';
import { SubscriptionPreviewException } from '@api/collections/subscriptions/errors/subscription-preview.exception';
import type { SubscriptionDocument } from '@api/collections/subscriptions/schemas/subscription.schema';
import type { SubscriptionCreditGrantService } from '@api/common/subscriptions/subscription-credit-grant.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import type {
  StripeCustomer,
  StripeService,
  StripeSubscription,
} from '@api/services/integrations/stripe/services/stripe.service';
import {
  StripeUpcomingInvoiceError,
  StripeUpcomingInvoiceErrorCode,
} from '@api/services/integrations/stripe/services/stripe-upcoming-invoice.error';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { SubscriptionPlan, SubscriptionStatus } from '@genfeedai/contracts';
import {
  type ISubscriptionOssReadModel,
  SubscriptionChangeFailureCode,
  SubscriptionPlanChangeCreditsOutcome,
  SubscriptionPreviewFailureCode,
} from '@genfeedai/contracts/interfaces/billing';
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

    /** A classified plan-change failure, unwrapped for assertions. */
    async function changeFailure(
      newPriceId = 'price_new',
      organizationId = ORGANIZATION_ID,
    ): Promise<SubscriptionChangeException> {
      const caught = await service
        .changeSubscriptionPlan(organizationId, newPriceId)
        .catch((error: unknown) => error);
      expect(caught).toBeInstanceOf(SubscriptionChangeException);
      return caught as SubscriptionChangeException;
    }

    /** Nothing may reach Stripe or our row before the preconditions pass. */
    function expectNoPlanChangeAttempted(): void {
      expect(stripeService.changeSubscriptionPlan).not.toHaveBeenCalled();
      expect(subscriptionDelegate.update).not.toHaveBeenCalled();
      expect(
        creditsUtilsService.resetOrganizationCredits,
      ).not.toHaveBeenCalled();
    }

    it('refuses an empty organization before the tenant-scoped lookup runs', async () => {
      const exception = await changeFailure('price_new', '');

      expect(exception.code).toBe(
        SubscriptionChangeFailureCode.ORGANIZATION_REQUIRED,
      );
      expect(exception.getStatus()).toBe(400);
      // A blank organization would otherwise mutate whichever row Prisma
      // returned once it dropped the undefined filter.
      expect(subscriptionDelegate.findFirst).not.toHaveBeenCalled();
      expectNoPlanChangeAttempted();
    });

    it('classifies a missing subscription row as subscription_missing', async () => {
      subscriptionDelegate.findFirst.mockResolvedValue(null);

      const exception = await changeFailure();

      expect(exception.code).toBe(
        SubscriptionChangeFailureCode.SUBSCRIPTION_MISSING,
      );
      expect(exception.getStatus()).toBe(404);
      expect(subscriptionDelegate.findFirst).toHaveBeenCalledWith({
        where: { isDeleted: false, organizationId: ORGANIZATION_ID },
      });
      expectNoPlanChangeAttempted();
    });

    it('classifies a row without a Stripe subscription as stripe_subscription_missing', async () => {
      subscriptionDelegate.findFirst.mockResolvedValue(
        buildSubscription({ customerId: null, stripeSubscriptionId: null }),
      );

      const exception = await changeFailure();

      expect(exception.code).toBe(
        SubscriptionChangeFailureCode.STRIPE_SUBSCRIPTION_MISSING,
      );
      expect(exception.getStatus()).toBe(409);
      expectNoPlanChangeAttempted();
    });

    it('classifies a price Stripe no longer knows as price_not_found', async () => {
      stripeService.getPrice.mockRejectedValue(
        Object.assign(new Error('No such price: price_new'), {
          code: 'resource_missing',
          param: 'id',
          statusCode: 404,
          type: 'StripeInvalidRequestError',
        }),
      );

      const exception = await changeFailure();

      expect(exception.code).toBe(
        SubscriptionChangeFailureCode.PRICE_NOT_FOUND,
      );
      expect(exception.getStatus()).toBe(404);
      expectNoPlanChangeAttempted();
    });

    it('classifies a non-recurring price as plan_interval_unsupported', async () => {
      stripeService.getPrice.mockResolvedValue({
        id: 'price_one_time',
        recurring: null,
      });

      const exception = await changeFailure('price_one_time');

      expect(exception.code).toBe(
        SubscriptionChangeFailureCode.PLAN_INTERVAL_UNSUPPORTED,
      );
      expect(exception.getStatus()).toBe(422);
      expectNoPlanChangeAttempted();
    });

    it('classifies a transient Stripe outage as a retryable 503 and never writes', async () => {
      stripeService.changeSubscriptionPlan.mockRejectedValue(
        Object.assign(new Error('connect ECONNRESET provider-secret-token'), {
          raw: { headers: { authorization: 'Bearer provider-secret-token' } },
          requestId: 'req_9',
          type: 'StripeConnectionError',
        }),
      );

      const exception = await changeFailure();

      expect(exception.code).toBe(
        SubscriptionChangeFailureCode.BILLING_PROVIDER_UNAVAILABLE,
      );
      expect(exception.getStatus()).toBe(503);
      expect(exception.meta).toEqual({
        isRetryable: true,
        maxRetries: 1,
        retryAfterSeconds: 5,
      });
      expect(subscriptionDelegate.update).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('failed'),
        expect.objectContaining({
          category: 'provider_unavailable',
          code: 'billing_provider_unavailable',
          stage: 'plan_change',
          stripeRequestId: 'req_9',
        }),
      );
      expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(
        'provider-secret-token',
      );
    });

    it('classifies a change Stripe refused as plan_change_rejected', async () => {
      stripeService.changeSubscriptionPlan.mockRejectedValue(
        Object.assign(new Error('Cannot change a cancelled subscription'), {
          code: 'parameter_invalid',
          statusCode: 400,
          type: 'StripeInvalidRequestError',
        }),
      );

      const exception = await changeFailure();

      expect(exception.code).toBe(
        SubscriptionChangeFailureCode.PLAN_CHANGE_REJECTED,
      );
      expect(exception.getStatus()).toBe(422);
      expect(subscriptionDelegate.update).not.toHaveBeenCalled();
    });

    describe('once Stripe has applied the change', () => {
      beforeEach(() => {
        stripeService.changeSubscriptionPlan.mockResolvedValue(
          buildStripeSubscription({ priceId: 'price_new' }),
        );
        creditGrantService.resolvePlanCredits.mockResolvedValue(5_900);
      });

      it('retries the local write once before giving up', async () => {
        subscriptionDelegate.update
          .mockRejectedValueOnce(new Error('deadlock detected'))
          .mockResolvedValueOnce(buildSubscription());

        const result = await service.changeSubscriptionPlan(
          ORGANIZATION_ID,
          'price_new',
        );

        expect(subscriptionDelegate.update).toHaveBeenCalledTimes(2);
        expect(result.creditsOutcome).toBe(
          SubscriptionPlanChangeCreditsOutcome.RESET,
        );
      });

      it('reports a persistent local write failure as plan_change_not_recorded, never as transient', async () => {
        subscriptionDelegate.update.mockRejectedValue(
          new Error('connection terminated'),
        );

        const exception = await changeFailure();

        expect(exception.code).toBe(
          SubscriptionChangeFailureCode.PLAN_CHANGE_NOT_RECORDED,
        );
        expect(exception.getStatus()).toBe(500);
        // Billing and our record disagree; a retry cannot clear that, so the
        // response must not invite one.
        expect(exception.meta).toEqual({
          isRetryable: false,
          maxRetries: 0,
          retryAfterSeconds: null,
        });
        expect(subscriptionDelegate.update).toHaveBeenCalledTimes(2);
        expect(logger.error).toHaveBeenCalledWith(
          expect.stringContaining('failed'),
          undefined,
          expect.objectContaining({
            code: 'plan_change_not_recorded',
            organizationId: ORGANIZATION_ID,
            stage: 'record',
          }),
        );
        // The change is real, so no credit reset is attempted on a row we
        // could not update.
        expect(
          creditsUtilsService.resetOrganizationCredits,
        ).not.toHaveBeenCalled();
      });

      it('keeps the completed change and reports the credit reset that failed', async () => {
        subscriptionDelegate.update.mockResolvedValue(buildSubscription());
        creditsUtilsService.resetOrganizationCredits.mockRejectedValue(
          new Error('credit ledger unavailable'),
        );

        const result = await service.changeSubscriptionPlan(
          ORGANIZATION_ID,
          'price_new',
        );

        // Failing here would tell the caller the change did not happen and
        // invite a retry that cannot undo it.
        expect(result.creditsOutcome).toBe(
          SubscriptionPlanChangeCreditsOutcome.FAILED,
        );
        expect(result.subscription).toBeDefined();
        expect(logger.error).toHaveBeenCalledWith(
          expect.stringContaining('credits were not reset'),
          undefined,
          expect.objectContaining({
            code: 'plan_credits_not_reset',
            organizationId: ORGANIZATION_ID,
            stage: 'credits',
          }),
        );
      });

      it('reports an unresolved grant without touching the balance', async () => {
        subscriptionDelegate.update.mockResolvedValue(buildSubscription());
        creditGrantService.resolvePlanCredits.mockResolvedValue(null);

        const result = await service.changeSubscriptionPlan(
          ORGANIZATION_ID,
          'price_new',
        );

        expect(result.creditsOutcome).toBe(
          SubscriptionPlanChangeCreditsOutcome.UNRESOLVED,
        );
        expect(
          creditsUtilsService.resetOrganizationCredits,
        ).not.toHaveBeenCalled();
      });

      it('leaves credits alone when the price did not actually change', async () => {
        subscriptionDelegate.update.mockResolvedValue(buildSubscription());

        const result = await service.changeSubscriptionPlan(
          ORGANIZATION_ID,
          'price_monthly',
        );

        expect(result.creditsOutcome).toBe(
          SubscriptionPlanChangeCreditsOutcome.UNCHANGED,
        );
        expect(
          creditsUtilsService.resetOrganizationCredits,
        ).not.toHaveBeenCalled();
      });
    });

    it('reports an unclassified fault as plan_change_failed with the cause attached', async () => {
      const cause = new TypeError('items is undefined');
      stripeService.getPrice.mockRejectedValue(cause);

      const exception = await changeFailure();

      expect(exception.code).toBe(
        SubscriptionChangeFailureCode.PLAN_CHANGE_FAILED,
      );
      expect(exception.getStatus()).toBe(500);
      expect(exception.cause).toBe(cause);
      expect(logger.error).toHaveBeenCalled();
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

    /** A preview is read-only: no failure path may touch local or Stripe state. */
    function expectNoStateMutation(): void {
      expect(subscriptionDelegate.create).not.toHaveBeenCalled();
      expect(subscriptionDelegate.update).not.toHaveBeenCalled();
      expect(subscriptionDelegate.updateMany).not.toHaveBeenCalled();
      expect(organizationSettingDelegate.updateMany).not.toHaveBeenCalled();
      expect(stripeService.changeSubscriptionPlan).not.toHaveBeenCalled();
      expect(
        creditsUtilsService.resetOrganizationCredits,
      ).not.toHaveBeenCalled();
    }

    async function previewFailure(
      newPriceId = 'price_new',
      organizationId = ORGANIZATION_ID,
    ): Promise<SubscriptionPreviewException> {
      const caught = await service
        .previewSubscriptionChange(organizationId, newPriceId)
        .catch((error: unknown) => error);
      expect(caught).toBeInstanceOf(SubscriptionPreviewException);
      return caught as SubscriptionPreviewException;
    }

    it('refuses an empty organization before touching the tenant-scoped lookup', async () => {
      const exception = await previewFailure('price_new', '');

      expect(exception.code).toBe(
        SubscriptionPreviewFailureCode.ORGANIZATION_REQUIRED,
      );
      expect(subscriptionDelegate.findFirst).not.toHaveBeenCalled();
      expectNoStateMutation();
    });

    it('classifies a missing subscription row as subscription_missing', async () => {
      subscriptionDelegate.findFirst.mockResolvedValue(null);

      const exception = await previewFailure();

      expect(exception.code).toBe(
        SubscriptionPreviewFailureCode.SUBSCRIPTION_MISSING,
      );
      expect(exception.getStatus()).toBe(404);
      expect(subscriptionDelegate.findFirst).toHaveBeenCalledWith({
        where: { isDeleted: false, organizationId: ORGANIZATION_ID },
      });
      expect(stripeService.getUpcomingInvoice).not.toHaveBeenCalled();
      expectNoStateMutation();
    });

    it('classifies a row without a Stripe subscription as stripe_subscription_missing', async () => {
      subscriptionDelegate.findFirst.mockResolvedValue(
        buildSubscription({ stripeSubscriptionId: null }),
      );

      const exception = await previewFailure();

      expect(exception.code).toBe(
        SubscriptionPreviewFailureCode.STRIPE_SUBSCRIPTION_MISSING,
      );
      expect(stripeService.getUpcomingInvoice).not.toHaveBeenCalled();
      expectNoStateMutation();
    });

    it.each([null, 'not-a-price'])(
      'classifies a current price of %s as current_price_missing before any Stripe call',
      async (stripePriceId) => {
        subscriptionDelegate.findFirst.mockResolvedValue(
          buildSubscription({ stripePriceId }),
        );

        const exception = await previewFailure();

        expect(exception.code).toBe(
          SubscriptionPreviewFailureCode.CURRENT_PRICE_MISSING,
        );
        expect(stripeService.getUpcomingInvoice).not.toHaveBeenCalled();
        expect(stripeService.getPrice).not.toHaveBeenCalled();
        expectNoStateMutation();
      },
    );

    it('classifies an unresolvable Stripe customer as billing_customer_missing', async () => {
      customerDelegate.findFirst.mockResolvedValue({ stripeCustomerId: null });

      const exception = await previewFailure();

      expect(exception.code).toBe(
        SubscriptionPreviewFailureCode.BILLING_CUSTOMER_MISSING,
      );
      expect(customerDelegate.findFirst).toHaveBeenCalledWith({
        select: { stripeCustomerId: true },
        where: {
          id: 'cust_row_1',
          isDeleted: false,
          organizationId: ORGANIZATION_ID,
        },
      });
      expect(stripeService.getUpcomingInvoice).not.toHaveBeenCalled();
      expectNoStateMutation();
    });

    it('classifies a subscription owned by another Stripe customer as billing_customer_mismatch', async () => {
      stripeService.getUpcomingInvoice.mockRejectedValue(
        new StripeUpcomingInvoiceError(
          StripeUpcomingInvoiceErrorCode.CUSTOMER_MISMATCH,
          'Stripe subscription does not belong to the requested customer',
        ),
      );

      const exception = await previewFailure();

      expect(exception.code).toBe(
        SubscriptionPreviewFailureCode.BILLING_CUSTOMER_MISMATCH,
      );
      expect(exception.getStatus()).toBe(409);
      expectNoStateMutation();
    });

    it('classifies Stripe items that no longer carry the recorded price as out of sync', async () => {
      stripeService.getUpcomingInvoice.mockRejectedValue(
        new StripeUpcomingInvoiceError(
          StripeUpcomingInvoiceErrorCode.SUBSCRIPTION_ITEM_MISSING,
          'No subscription item found for current Stripe price',
        ),
      );

      const exception = await previewFailure();

      expect(exception.code).toBe(
        SubscriptionPreviewFailureCode.STRIPE_SUBSCRIPTION_OUT_OF_SYNC,
      );
      expectNoStateMutation();
    });

    it('classifies a Stripe subscription deleted upstream as stripe_subscription_missing', async () => {
      stripeService.getUpcomingInvoice.mockRejectedValue(
        Object.assign(new Error('No such subscription: sub_stripe_1'), {
          code: 'resource_missing',
          param: 'subscription',
          statusCode: 404,
          type: 'StripeInvalidRequestError',
        }),
      );

      const exception = await previewFailure();

      expect(exception.code).toBe(
        SubscriptionPreviewFailureCode.STRIPE_SUBSCRIPTION_MISSING,
      );
      expectNoStateMutation();
    });

    it('classifies a price Stripe no longer knows as price_not_found', async () => {
      stripeService.getPrice.mockImplementation((priceId: string) =>
        priceId === 'price_new'
          ? Promise.reject(
              Object.assign(new Error('No such price: price_new'), {
                code: 'resource_missing',
                param: 'id',
                statusCode: 404,
                type: 'StripeInvalidRequestError',
              }),
            )
          : Promise.resolve({
              currency: 'usd',
              id: priceId,
              recurring: { interval: 'month', interval_count: 1 },
              unit_amount: 4_900,
            }),
      );

      const exception = await previewFailure();

      expect(exception.code).toBe(
        SubscriptionPreviewFailureCode.PRICE_NOT_FOUND,
      );
      expect(exception.getStatus()).toBe(404);
      // Prices resolve before the preview: Stripe reports a missing id from
      // the preview's own price retrieve with `param: 'id'`, which would
      // otherwise read as a missing subscription.
      expect(stripeService.getUpcomingInvoice).not.toHaveBeenCalled();
      expectNoStateMutation();
    });

    it('classifies a proration Stripe refuses to price as preview_rejected', async () => {
      stripeService.getUpcomingInvoice.mockRejectedValue(
        Object.assign(
          new Error('Cannot preview a subscription with a different currency'),
          {
            code: 'parameter_invalid',
            statusCode: 400,
            type: 'StripeInvalidRequestError',
          },
        ),
      );

      const exception = await previewFailure();

      expect(exception.code).toBe(
        SubscriptionPreviewFailureCode.PREVIEW_REJECTED,
      );
      expect(exception.getStatus()).toBe(422);
      expectNoStateMutation();
    });

    it('classifies a transient Stripe outage as a retryable 503 and logs safe diagnostics only', async () => {
      stripeService.getUpcomingInvoice.mockRejectedValue(
        Object.assign(new Error('connect ECONNRESET provider-secret-token'), {
          raw: { headers: { authorization: 'Bearer provider-secret-token' } },
          requestId: 'req_42',
          type: 'StripeConnectionError',
        }),
      );

      const exception = await previewFailure();

      expect(exception.code).toBe(
        SubscriptionPreviewFailureCode.BILLING_PROVIDER_UNAVAILABLE,
      );
      expect(exception.getStatus()).toBe(503);
      expect(exception.meta).toEqual({
        isRetryable: true,
        maxRetries: 1,
        retryAfterSeconds: 5,
      });
      // One bounded retry is the client's call; the service never loops.
      expect(stripeService.getUpcomingInvoice).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('failed'),
        expect.objectContaining({
          category: 'provider_unavailable',
          code: 'billing_provider_unavailable',
          isRetryable: true,
          organizationId: ORGANIZATION_ID,
          stage: 'upcoming_invoice',
          stripeRequestId: 'req_42',
        }),
      );
      expect(JSON.stringify(logger.warn.mock.calls)).not.toContain(
        'provider-secret-token',
      );
      expect(logger.error).not.toHaveBeenCalled();
      expectNoStateMutation();
    });

    it('reports an unclassified fault as preview_failed with the cause attached', async () => {
      const cause = new TypeError('lines is undefined');
      stripeService.getUpcomingInvoice.mockRejectedValue(cause);

      const exception = await previewFailure();

      expect(exception.code).toBe(
        SubscriptionPreviewFailureCode.PREVIEW_FAILED,
      );
      expect(exception.getStatus()).toBe(500);
      expect(exception.cause).toBe(cause);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('failed'),
        undefined,
        expect.objectContaining({
          category: 'unknown',
          code: 'preview_failed',
          errorName: 'TypeError',
        }),
      );
      expectNoStateMutation();
    });

    it('never writes local or Stripe state even on success', async () => {
      await service.previewSubscriptionChange(ORGANIZATION_ID, 'price_scale');

      expectNoStateMutation();
    });
  });
});
