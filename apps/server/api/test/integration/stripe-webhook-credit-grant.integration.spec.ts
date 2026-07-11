/**
 * Real-backend proof of the Stripe subscription -> credit-grant money path
 * (#1398, linking #334).
 *
 * Unlike `payment-processing.integration.spec.ts` (which mocks the entire
 * Stripe SDK AND the database), this spec:
 *  - Constructs a REAL Stripe webhook signature via the real Stripe SDK
 *    (`stripe.webhooks.generateTestHeaderString` / `constructEventAsync`) and
 *    invokes `StripeWebhookController.handleStripe` directly with the raw,
 *    signed payload — the same code path production traffic takes.
 *  - Writes to and reads from a REAL Postgres database via `PrismaService`
 *    (through `E2ETestModule.forRoot`), asserting on real `creditTransaction`
 *    / `creditBalance` rows.
 *
 * It proves two layers of webhook idempotency:
 *  1. Redis-level: replaying the identical Stripe event id is a no-op
 *     (`stripe:webhook:<event.id>` SET NX guard in the controller).
 *  2. Postgres-level: Stripe redelivering the SAME invoice under a NEW event
 *     id (e.g. a dashboard "Resend" or a retry after the 24h Redis TTL
 *     expires) must not double-grant credits. This is enforced by
 *     `StripeWebhookSupportService#hasSubscriptionInvoiceCreditGrant`,
 *     keyed on a `referenceId`/`referenceType` persisted on the credit
 *     transaction row.
 *
 * The Postgres-level MONTHLY path already persisted this reference via
 * `CreditsUtilsService#addOrganizationCreditsWithExpiration`. The YEARLY
 * path did not — `resetOrganizationCredits` had no mechanism to persist a
 * reference, making the pre-check dead code for YEARLY organizations, so a
 * replayed `invoice.paid` past the Redis TTL would double (or triple, ...)
 * a yearly organization's credit balance. Both `resetOrganizationCredits`
 * (via a new optional `options` param) and this spec's YEARLY scenario cover
 * that gap.
 */

// Allow skipping this file when the Prisma DB is not available
// Set SKIP_PRISMA_DB=true to skip all tests in this file
if (process.env.SKIP_PRISMA_DB === 'true') {
  const g: any = global as any;
  const d: any = (global as any).describe;
  g.describe = ((name: string, fn: any) =>
    d?.skip ? d.skip(name, fn) : describe(name, fn)) as any;
  const i: any = (global as any).it;
  g.it = ((name: string, fn: any) =>
    i?.skip ? i.skip(name, fn) : it(name, fn)) as any;
  g.test = g.it;
}

import { ActivitiesService } from '@api/collections/activities/services/activities.service';
import { CreditBalanceService } from '@api/collections/credits/services/credit-balance.service';
import { CreditTransactionsService } from '@api/collections/credits/services/credit-transactions.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import { CacheInvalidationService } from '@api/common/services/cache-invalidation.service';
import { RequestContextCacheService } from '@api/common/services/request-context-cache.service';
import { StripeCheckoutWebhookHandler } from '@api/endpoints/webhooks/stripe/handlers/stripe-checkout-webhook.handler';
import { StripeCustomerWebhookHandler } from '@api/endpoints/webhooks/stripe/handlers/stripe-customer-webhook.handler';
import { StripeInvoiceWebhookHandler } from '@api/endpoints/webhooks/stripe/handlers/stripe-invoice-webhook.handler';
import { StripeSubscriptionWebhookHandler } from '@api/endpoints/webhooks/stripe/handlers/stripe-subscription-webhook.handler';
import { StripeWebhookSupportService } from '@api/endpoints/webhooks/stripe/handlers/stripe-webhook-support.service';
import { StripeWebhookController } from '@api/endpoints/webhooks/stripe/webhooks.stripe.controller';
import { StripeWebhookService } from '@api/endpoints/webhooks/stripe/webhooks.stripe.service';
import { StripeService } from '@api/services/integrations/stripe/services/stripe.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  createTestOrganization,
  generateIdString,
} from '@api-test/e2e/e2e-test.utils';
import type { TestDatabaseHelper } from '@api-test/e2e-test.module';
import {
  createTestDatabaseHelper,
  E2ETestModule,
} from '@api-test/e2e-test.module';
import { CreditTransactionCategory, SubscriptionPlan } from '@genfeedai/enums';
import type {
  ISubscriptionFindOneFilter,
  ISubscriptionOssReadModel,
  ISubscriptionsService,
} from '@genfeedai/interfaces/billing';
import { SUBSCRIPTIONS_SERVICE } from '@genfeedai/interfaces/billing';
import { ConfigService } from '@libs/config/config.service';
import { RedisService } from '@libs/redis/redis.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

vi.mock('@genfeedai/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@genfeedai/config')>();
  return {
    ...actual,
    isSelfHostedDeployment: () => false,
  };
});

const STRIPE_WEBHOOK_SECRET = 'whsec_test_stripe_webhook_credit_grant_e2e';
const SUBSCRIPTION_CREDIT_REFERENCE_TYPE = 'stripe-invoice:subscription-grant';

const createRedisPublisherDouble = () => {
  const store = new Map<string, string>();
  return {
    del: vi.fn(async (key: string): Promise<number> => {
      return store.delete(key) ? 1 : 0;
    }),
    set: vi.fn(
      async (
        key: string,
        value: string,
        _ex: 'EX',
        _ttl: number,
        nx: 'NX',
      ): Promise<'OK' | null> => {
        if (nx === 'NX' && store.has(key)) {
          return null;
        }
        store.set(key, value);
        return 'OK';
      },
    ),
  };
};

const buildSubscriptionsServiceStub = (
  subscriptionsById: Map<string, ISubscriptionOssReadModel>,
): ISubscriptionsService => ({
  createForOrganization: vi.fn(async () => {
    throw new Error('createForOrganization is not exercised by this spec');
  }),
  findAll: vi.fn(async () => ({ docs: [], total: 0, totalDocs: 0 })),
  findByOrganizationId: vi.fn(async () => null),
  findByStripeCustomerId: vi.fn(async () => null),
  findOne: vi.fn(async (filter: ISubscriptionFindOneFilter) => {
    if (!filter.stripeSubscriptionId) {
      return null;
    }
    return subscriptionsById.get(filter.stripeSubscriptionId) ?? null;
  }),
  patch: vi.fn(async (id: string, data: unknown) => {
    for (const subscription of subscriptionsById.values()) {
      if (String(subscription.id) === id) {
        Object.assign(subscription, data as Record<string, unknown>);
        return subscription;
      }
    }
    return null;
  }),
  syncSubscriptionState: vi.fn(async () => undefined),
  syncWithStripe: vi.fn(
    async (subscription: ISubscriptionOssReadModel) => subscription,
  ),
});

const buildInvoicePaidEventPayload = (params: {
  eventId: string;
  invoiceId: string;
  stripeSubscriptionId: string;
}): string =>
  JSON.stringify({
    api_version: '2026-03-25.dahlia',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        billing_reason: 'subscription_cycle',
        id: params.invoiceId,
        metadata: {},
        object: 'invoice',
        parent: {
          subscription_details: {
            subscription: params.stripeSubscriptionId,
          },
        },
      },
    },
    id: params.eventId,
    livemode: false,
    object: 'event',
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    type: 'invoice.paid',
  });

describe('Stripe webhook subscription credit grant (#1398 real-backend E2E)', () => {
  let moduleRef: TestingModule;
  let dbHelper: TestDatabaseHelper;
  let controller: StripeWebhookController;
  let stripeService: StripeService;
  let prisma: PrismaService;
  let webhookSecret: string;
  let redisPublisherDouble: ReturnType<typeof createRedisPublisherDouble>;
  let subscriptionsById: Map<string, ISubscriptionOssReadModel>;

  beforeAll(async () => {
    redisPublisherDouble = createRedisPublisherDouble();
    subscriptionsById = new Map();

    const moduleConfig = await E2ETestModule.forRoot({
      configOverrides: {
        STRIPE_SECRET_KEY: 'sk_test_stripe_webhook_credit_grant_e2e',
        STRIPE_WEBHOOK_SIGNING_SECRET: STRIPE_WEBHOOK_SECRET,
      },
      controllers: [StripeWebhookController],
      providers: [
        StripeService,
        StripeWebhookService,
        StripeInvoiceWebhookHandler,
        StripeWebhookSupportService,
        CreditsUtilsService,
        CreditBalanceService,
        CreditTransactionsService,
        {
          provide: RedisService,
          useValue: { getPublisher: () => redisPublisherDouble },
        },
        { provide: StripeSubscriptionWebhookHandler, useValue: {} },
        { provide: StripeCheckoutWebhookHandler, useValue: {} },
        { provide: StripeCustomerWebhookHandler, useValue: {} },
        {
          provide: SUBSCRIPTIONS_SERVICE,
          useValue: buildSubscriptionsServiceStub(subscriptionsById),
        },
        {
          provide: UsersService,
          useValue: {
            findOne: vi.fn().mockResolvedValue(null),
            patch: vi.fn().mockResolvedValue(null),
          },
        },
        {
          provide: AccessBootstrapCacheService,
          useValue: {
            invalidateForOrganization: vi.fn().mockResolvedValue(undefined),
            invalidateForUser: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: ActivitiesService,
          useValue: { create: vi.fn().mockResolvedValue({}) },
        },
        {
          provide: OrganizationSettingsService,
          useValue: {
            findOne: vi.fn().mockResolvedValue(null),
            patch: vi.fn().mockResolvedValue(null),
          },
        },
        {
          provide: OrganizationsService,
          useValue: { findOne: vi.fn().mockResolvedValue(null) },
        },
        {
          provide: RequestContextCacheService,
          useValue: {
            invalidateForOrganization: vi.fn().mockResolvedValue(undefined),
            invalidateForUser: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: NotificationsPublisherService,
          useValue: { emit: vi.fn().mockResolvedValue(undefined) },
        },
        {
          provide: CacheInvalidationService,
          useValue: { invalidate: vi.fn().mockResolvedValue(undefined) },
        },
        { provide: EventEmitter2, useValue: { emit: vi.fn() } },
      ],
      useMockGuards: false,
    });

    moduleRef = await Test.createTestingModule({
      imports: [moduleConfig],
    }).compile();

    dbHelper = createTestDatabaseHelper(moduleRef);
    controller = moduleRef.get(StripeWebhookController);
    stripeService = moduleRef.get(StripeService);
    prisma = moduleRef.get(PrismaService);
    webhookSecret = moduleRef
      .get(ConfigService)
      .get('STRIPE_WEBHOOK_SIGNING_SECRET') as string;
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  beforeEach(async () => {
    await dbHelper.clearDatabase();
    subscriptionsById.clear();
  });

  const signAndBuildRequest = (payload: string): Request => {
    const signature = stripeService.stripe.webhooks.generateTestHeaderString({
      payload,
      secret: webhookSecret,
    });
    return {
      body: payload,
      headers: { 'stripe-signature': signature },
    } as unknown as Request;
  };

  const seedOrganizationWithSubscription = async (params: {
    plan: SubscriptionPlan;
    stripeSubscriptionId: string;
  }) => {
    const organizationId = generateIdString();
    const userId = generateIdString();
    const organization = createTestOrganization({
      id: organizationId,
      label: `Test Org ${params.plan} ${organizationId}`,
      user: userId,
    });

    await dbHelper.seedCollection('organizations', [organization]);

    const subscription: ISubscriptionOssReadModel = {
      id: generateIdString(),
      organization: organizationId,
      status: 'active',
      stripeSubscriptionId: params.stripeSubscriptionId,
      type: params.plan,
      user: userId,
    };
    subscriptionsById.set(params.stripeSubscriptionId, subscription);

    return { organizationId, subscription };
  };

  it('processes a monthly invoice.paid webhook exactly once when the identical Stripe event is replayed (Redis-level idempotency)', async () => {
    const stripeSubscriptionId = `sub_${generateIdString()}`;
    const { organizationId } = await seedOrganizationWithSubscription({
      plan: SubscriptionPlan.MONTHLY,
      stripeSubscriptionId,
    });

    const payload = buildInvoicePaidEventPayload({
      eventId: `evt_${generateIdString()}`,
      invoiceId: `in_${generateIdString()}`,
      stripeSubscriptionId,
    });

    const firstResult = await controller.handleStripe(
      signAndBuildRequest(payload),
    );
    const secondResult = await controller.handleStripe(
      signAndBuildRequest(payload),
    );

    expect(firstResult).toEqual({ success: true });
    expect(secondResult).toEqual({ success: true });

    const transactions = await prisma.creditTransaction.findMany({
      where: {
        isDeleted: false,
        organizationId,
        referenceType: SUBSCRIPTION_CREDIT_REFERENCE_TYPE,
      },
    });
    expect(transactions).toHaveLength(1);
    expect(transactions[0]?.category).toBe(CreditTransactionCategory.ADD);

    const balance = await prisma.creditBalance.findFirst({
      where: { isDeleted: false, organizationId },
    });
    expect(balance?.balance).toBe(35_000);
  });

  it('does not double-grant credits for a MONTHLY subscription when Stripe redelivers the same invoice under a NEW event id (Postgres-level dedup)', async () => {
    const stripeSubscriptionId = `sub_${generateIdString()}`;
    const { organizationId } = await seedOrganizationWithSubscription({
      plan: SubscriptionPlan.MONTHLY,
      stripeSubscriptionId,
    });
    const invoiceId = `in_${generateIdString()}`;

    const firstDelivery = buildInvoicePaidEventPayload({
      eventId: `evt_${generateIdString()}`,
      invoiceId,
      stripeSubscriptionId,
    });
    const redelivery = buildInvoicePaidEventPayload({
      eventId: `evt_${generateIdString()}`,
      invoiceId,
      stripeSubscriptionId,
    });

    await controller.handleStripe(signAndBuildRequest(firstDelivery));
    await controller.handleStripe(signAndBuildRequest(redelivery));

    const transactions = await prisma.creditTransaction.findMany({
      where: {
        isDeleted: false,
        organizationId,
        referenceType: SUBSCRIPTION_CREDIT_REFERENCE_TYPE,
      },
    });
    expect(transactions).toHaveLength(1);

    const balance = await prisma.creditBalance.findFirst({
      where: { isDeleted: false, organizationId },
    });
    expect(balance?.balance).toBe(35_000);
  });

  it('does not double-reset credits for a YEARLY subscription when Stripe redelivers the same invoice under a NEW event id (#1398 fix: Postgres-level dedup)', async () => {
    const stripeSubscriptionId = `sub_${generateIdString()}`;
    const { organizationId } = await seedOrganizationWithSubscription({
      plan: SubscriptionPlan.YEARLY,
      stripeSubscriptionId,
    });
    const invoiceId = `in_${generateIdString()}`;

    const firstDelivery = buildInvoicePaidEventPayload({
      eventId: `evt_${generateIdString()}`,
      invoiceId,
      stripeSubscriptionId,
    });
    const redelivery = buildInvoicePaidEventPayload({
      eventId: `evt_${generateIdString()}`,
      invoiceId,
      stripeSubscriptionId,
    });

    await controller.handleStripe(signAndBuildRequest(firstDelivery));
    await controller.handleStripe(signAndBuildRequest(redelivery));

    const transactions = await prisma.creditTransaction.findMany({
      where: {
        isDeleted: false,
        organizationId,
        referenceType: SUBSCRIPTION_CREDIT_REFERENCE_TYPE,
      },
    });
    // Before the #1398 fix, resetOrganizationCredits had no way to persist a
    // referenceId/referenceType, so hasSubscriptionInvoiceCreditGrant could
    // never find this row and the redelivery would reset credits a second
    // time (the balance would still read 500_000 either way, since RESET is
    // absolute — but a second RESET row, and re-running side effects like
    // markOrganizationAsHavingCredits/websocket emits, would still occur).
    // The transaction-count assertion is the real proof of dedup.
    expect(transactions).toHaveLength(1);
    expect(transactions[0]?.category).toBe(CreditTransactionCategory.RESET);
    expect(transactions[0]?.referenceId).toBe(`stripe-invoice:${invoiceId}`);

    const balance = await prisma.creditBalance.findFirst({
      where: { isDeleted: false, organizationId },
    });
    expect(balance?.balance).toBe(500_000);
  });
});
