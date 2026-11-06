import { BillingAccountsService } from '@api/collections/billing-accounts/services/billing-accounts.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import { StripeCheckoutWebhookHandler } from '@api/endpoints/webhooks/stripe/handlers/stripe-checkout-webhook.handler';
import { StripeCustomerWebhookHandler } from '@api/endpoints/webhooks/stripe/handlers/stripe-customer-webhook.handler';
import { StripeInvoiceWebhookHandler } from '@api/endpoints/webhooks/stripe/handlers/stripe-invoice-webhook.handler';
import { StripePaymentWebhookHandler } from '@api/endpoints/webhooks/stripe/handlers/stripe-payment-webhook.handler';
import { StripeSubscriptionCreditReconcilerService } from '@api/endpoints/webhooks/stripe/handlers/stripe-subscription-credit-reconciler.service';
import { StripeSubscriptionWebhookHandler } from '@api/endpoints/webhooks/stripe/handlers/stripe-subscription-webhook.handler';
import { StripeWebhookSupportService } from '@api/endpoints/webhooks/stripe/handlers/stripe-webhook-support.service';
import { StripeWebhookBillingService } from '@api/endpoints/webhooks/stripe/stripe-webhook-billing.service';
import { StripeWebhookController } from '@api/endpoints/webhooks/stripe/webhooks.stripe.controller';
import { StripeWebhookService } from '@api/endpoints/webhooks/stripe/webhooks.stripe.service';
import { HttpExceptionFilter } from '@api/helpers/filters/http-exception/http-exception.filter';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { StripeService } from '@api/services/integrations/stripe/services/stripe.service';
import { selectSoftwareSubscriptionItem } from '@api/services/integrations/stripe/services/stripe-software-item.util';
import { LifecycleEmailService } from '@api/services/lifecycle-emails/lifecycle-email.service';
import { SystemEventsService } from '@api/services/system-events/system-events.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { SUBSCRIPTIONS_SERVICE } from '@genfeedai/contracts/interfaces/billing';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@genfeedai/config')>()),
  isSelfHostedDeployment: () => false,
}));

type Row = Record<string, unknown>;
type LogEntry = [string, Row | undefined];

const SUBSCRIPTION: Row = {
  billingAccountId: null,
  customerId: 'customer_1',
  id: 'db_sub',
  isDeleted: false,
  organizationId: 'org_1',
  stripeSubscriptionId: null,
  userId: 'user_1',
};
const CUSTOMER: Row = {
  billingAccountId: null,
  id: 'customer_1',
  isDeleted: false,
  organizationId: 'org_1',
  stripeCustomerId: 'cus_1',
};
// The identity fields the persist guard pins; relation filters are not modelled.
const GUARDED = [
  'billingAccountId',
  'customerId',
  'id',
  'isDeleted',
  'organizationId',
  'stripeSubscriptionId',
];
const created = {
  cancel_at_period_end: false,
  customer: { id: 'cus_1' },
  id: 'sub_1',
  items: { data: [{ price: { id: 'price_1' } }] },
  status: 'active',
};
const renewal = (object: Row) => ({
  data: {
    object: {
      billing_reason: 'subscription_cycle',
      customer: 'cus_1',
      ...object,
    },
  },
  id: 'evt_invoice',
  type: 'invoice.paid',
});

const scalarMatch = (row: Row, where: Row, keys = Object.keys(where)) =>
  keys.every((key) => row[key] === where[key]);

describe('Stripe billing HTTP composition', () => {
  // Stored rows, the delivered event and every effect a delivery can leave.
  let subscription: Row;
  let event: Row;
  let isAccountMissing: boolean;
  let forcedUpdateCounts: number[];
  let concurrentMove: Row | undefined;
  let reconciled: Row[];
  let synced: unknown[];
  let tierUpdates: unknown[];
  let warnings: LogEntry[];
  let errors: LogEntry[];
  let claimedKeys: Set<string>;
  let releasedKeys: string[];
  let app: INestApplication;

  const deliver = () =>
    request(app.getHttpServer()).post('/webhooks/stripe/callback').send({});

  beforeEach(async () => {
    subscription = { ...SUBSCRIPTION };
    event = {
      data: { object: created },
      id: 'evt_1',
      type: 'customer.subscription.created',
    };
    isAccountMissing = false;
    forcedUpdateCounts = [];
    concurrentMove = undefined;
    reconciled = [];
    synced = [];
    tierUpdates = [];
    warnings = [];
    errors = [];
    claimedKeys = new Set();
    releasedKeys = [];

    const logger = {
      error: (message: string, context?: Row) => {
        errors.push([message, context]);
      },
      log: () => undefined,
      warn: (message: string, context?: Row) => {
        warnings.push([message, context]);
      },
    };
    const prisma = {
      customer: {
        findFirst: async ({ where }: { where: Row }) =>
          scalarMatch(CUSTOMER, where) ? CUSTOMER : null,
        findMany: async ({ where }: { where: Row }) =>
          scalarMatch(CUSTOMER, where) ? [CUSTOMER] : [],
      },
      subscription: {
        findMany: async ({ where }: { where: Row }) =>
          scalarMatch(subscription, where) ? [{ ...subscription }] : [],
        updateMany: async ({ data, where }: { data: Row; where: Row }) => {
          if (concurrentMove) {
            Object.assign(subscription, concurrentMove);
            concurrentMove = undefined;
          }
          const forced = forcedUpdateCounts.shift();
          if (forced !== undefined) return { count: forced };
          if (!scalarMatch(subscription, where, GUARDED)) return { count: 0 };
          Object.assign(subscription, data);
          return { count: 1 };
        },
      },
    };
    // Redis SET NX claims an event id; a failed delivery releases it.
    const publisher = {
      del: async (key: string) => {
        releasedKeys.push(key);
        return Number(claimedKeys.delete(key));
      },
      set: async (key: string) => {
        if (claimedKeys.has(key)) return null;
        claimedKeys.add(key);
        return 'OK';
      },
    };
    const support = {
      notifyOperatorOfBillingEvent: async () => undefined,
      recordProcessingFee: async () => undefined,
      recordRevenueEvent: async () => undefined,
      resolveSubscriptionPlan: () => 'monthly',
      resolveTierFromPriceId: () => null,
      softwareItem: selectSoftwareSubscriptionItem,
      updateOrganizationTierAndModels: async (...args: unknown[]) => {
        tierUpdates.push(args);
      },
    };

    const module = await Test.createTestingModule({
      controllers: [StripeWebhookController],
      providers: [
        {
          provide: SystemEventsService,
          useValue: { recordStripeEvent: async () => undefined },
        },
        StripeWebhookService,
        StripeSubscriptionWebhookHandler,
        StripeInvoiceWebhookHandler,
        StripeWebhookBillingService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: BillingAccountsService,
          useValue: {
            resolveForOrganization: async () => {
              if (isAccountMissing) {
                isAccountMissing = false;
                return null;
              }
              return { id: 'ba_1', isDeleted: false, stripeCustomerId: null };
            },
          },
        },
        { provide: LoggerService, useValue: logger },
        { provide: RedisService, useValue: { getPublisher: () => publisher } },
        {
          provide: StripeService,
          useValue: { constructWebhookEvent: async () => event },
        },
        {
          provide: SUBSCRIPTIONS_SERVICE,
          useValue: {
            syncSubscriptionState: async (...args: unknown[]) => {
              synced.push(args);
            },
          },
        },
        {
          provide: StripeSubscriptionCreditReconcilerService,
          useValue: {
            reconcile: async (input: Row) => {
              reconciled.push(input);
            },
          },
        },
        { provide: StripeWebhookSupportService, useValue: support },
        { provide: UsersService, useValue: { findOne: async () => null } },
        { provide: LifecycleEmailService, useValue: {} },
        { provide: AccessBootstrapCacheService, useValue: {} },
        ...[
          StripeCheckoutWebhookHandler,
          StripeCustomerWebhookHandler,
          StripePaymentWebhookHandler,
        ].map((provide) => ({ provide, useValue: {} })),
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    app.useGlobalFilters(
      new HttpExceptionFilter(
        logger as unknown as LoggerService,
        { get: () => 'development' } as unknown as ConfigService,
      ),
    );
    await app.init();
    await app.listen(0, '127.0.0.1');
  });
  afterEach(async () => {
    await app.close();
  });

  const metadata = {
    billing_account_type: 'organization',
    billing_organization_id: 'org_1',
  };

  it.each([
    ['customer.subscription.created', { ...created, metadata }],
    [
      'invoice.paid',
      {
        billing_reason: 'subscription_cycle',
        customer: 'cus_1',
        id: 'in_production',
        parent: { subscription_details: { metadata, subscription: 'sub_1' } },
      },
    ],
  ])(
    'accepts production checkout metadata in real %s composition',
    async (type, object) => {
      event = { data: { object }, id: 'evt_production', type };

      await deliver().expect(200);

      expect(subscription.stripeSubscriptionId).toBe('sub_1');
      expect(reconciled).toEqual([
        expect.objectContaining({ billingAccountId: 'ba_1' }),
      ]);
      expect(warnings).toEqual([]);
      expect(errors).toEqual([]);
    },
  );

  it('returns one classified warning and 503, releases the claimed key, and retries after repair', async () => {
    isAccountMissing = true;

    const response = await deliver();

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      errors: [
        {
          code: 'identity_missing',
          detail: 'Stripe webhook billing reconciliation unavailable',
          status: '503',
          title: 'Service Unavailable',
        },
      ],
    });
    expect(warnings).toEqual([
      [
        expect.any(String),
        {
          code: 'identity_missing',
          errorName: 'StripeWebhookBillingError',
          eventId: 'evt_1',
          eventType: 'customer.subscription.created',
          kind: 'BILLING',
        },
      ],
    ]);
    expect(errors).toEqual([]);
    expect(releasedKeys).toEqual(['stripe:webhook:evt_1']);
    expect(subscription).toEqual(SUBSCRIPTION);
    expect(reconciled).toEqual([]);

    await deliver().expect(200);
    await deliver().expect(200);

    expect(subscription.stripeSubscriptionId).toBe('sub_1');
    expect(reconciled).toHaveLength(1);
  });

  it.each([
    [
      'a concurrent delivery moved the identity between resolve and persist',
      { stripeSubscriptionId: 'sub_1' },
      [],
    ],
    ['the guard matched more than one row', undefined, [2]],
  ])(
    'stops every dependent write, returns 503 and completes on redelivery when %s',
    async (_case, move, counts) => {
      concurrentMove = move;
      forcedUpdateCounts = counts;

      const response = await deliver();

      expect(response.status).toBe(503);
      expect(response.body.errors[0].code).toBe('identity_stale');
      expect(synced).toEqual([]);
      expect(tierUpdates).toEqual([]);
      expect(reconciled).toEqual([]);
      expect(warnings).toEqual([
        [
          expect.stringContaining('webhook billing rejected'),
          expect.objectContaining({
            code: 'identity_stale',
            eventId: 'evt_1',
            kind: 'BILLING',
          }),
        ],
      ]);
      expect(errors).toEqual([]);
      // The key is released so Stripe's redelivery re-resolves against the
      // updated row and completes the write.
      expect(releasedKeys).toEqual(['stripe:webhook:evt_1']);

      await deliver().expect(200);

      expect(subscription.stripeSubscriptionId).toBe('sub_1');
      expect(reconciled).toHaveLength(1);
    },
  );

  it.each([undefined, '', ' '])(
    'acknowledges invalid renewal invoice id %j without writes or a retry loop',
    async (id) => {
      event = renewal({
        id,
        parent: { subscription_details: { subscription: 'sub_1' } },
      });

      await deliver().expect(200);

      expect(subscription).toEqual(SUBSCRIPTION);
      expect(reconciled).toEqual([]);
      expect(warnings).toEqual([
        [
          expect.stringContaining('webhook billing acknowledged'),
          expect.objectContaining({ code: 'invalid_payload' }),
        ],
      ]);
      expect(errors).toEqual([]);
      expect(releasedKeys).toEqual([]);
    },
  );

  it('warns and acknowledges a subscription_cycle invoice with no subscription id', async () => {
    event = renewal({ id: 'in_no_subscription' });

    await deliver().expect(200);

    expect(subscription).toEqual(SUBSCRIPTION);
    expect(reconciled).toEqual([]);
    expect(warnings).toEqual([
      [
        expect.stringContaining('invoice carries no subscription id'),
        {
          billingReason: 'subscription_cycle',
          invoiceId: 'in_no_subscription',
        },
      ],
    ]);
    expect(errors).toEqual([]);
    expect(releasedKeys).toEqual([]);
  });

  it('treats null invoice period boundaries as absent instead of rejecting the payload', async () => {
    event = renewal({
      id: 'in_null_period',
      parent: { subscription_details: { subscription: 'sub_1' } },
      period_end: null,
      period_start: null,
    });

    await deliver().expect(200);

    expect(reconciled).toHaveLength(1);
    expect(reconciled[0]).toMatchObject({
      billingAccountId: 'ba_1',
      invoiceId: 'in_null_period',
    });
    expect(reconciled[0]).not.toHaveProperty('periodEnd');
    expect(reconciled[0]).not.toHaveProperty('periodStart');
    expect(warnings).toEqual([]);
    expect(errors).toEqual([]);
  });
});
