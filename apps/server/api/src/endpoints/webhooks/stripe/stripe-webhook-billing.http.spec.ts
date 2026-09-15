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
import { LifecycleEmailService } from '@api/services/lifecycle-emails/lifecycle-email.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { SUBSCRIPTIONS_SERVICE } from '@genfeedai/contracts/interfaces/billing';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { RedisService } from '@libs/redis/redis.service';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

vi.mock('@genfeedai/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@genfeedai/config')>()),
  isSelfHostedDeployment: () => false,
}));

describe('Stripe billing HTTP composition', () => {
  let app: INestApplication;
  const logger = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const subscription = {
    id: 'db_sub',
    organizationId: 'org_1',
    userId: 'user_1',
    customerId: 'customer_1',
    billingAccountId: null,
    stripeSubscriptionId: null,
    isDeleted: false,
  };
  const prisma = {
    subscription: { findMany: vi.fn(), updateMany: vi.fn() },
    customer: { findMany: vi.fn(), findFirst: vi.fn() },
  };
  const accounts = { resolveForOrganization: vi.fn() };
  const keys = new Set<string>();
  const publisher = {
    set: vi.fn(async (key: string) => {
      if (keys.has(key)) return null;
      keys.add(key);
      return 'OK';
    }),
    del: vi.fn(async (key: string) => Number(keys.delete(key))),
  };
  const reconciler = { reconcile: vi.fn() };
  const subscriptions = { syncSubscriptionState: vi.fn() };
  const support = {
    resolveSubscriptionPlan: vi.fn(() => 'monthly'),
    resolveTierFromPriceId: vi.fn(() => null),
    updateOrganizationTierAndModels: vi.fn(),
  };
  const stripe = { constructWebhookEvent: vi.fn() };
  const created = {
    id: 'sub_1',
    customer: { id: 'cus_1' },
    status: 'active',
    cancel_at_period_end: false,
    items: { data: [{ price: { id: 'price_1' } }] },
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    keys.clear();
    prisma.subscription.findMany.mockResolvedValue([subscription]);
    prisma.subscription.updateMany.mockResolvedValue({ count: 1 });
    prisma.customer.findFirst.mockResolvedValue({
      id: 'customer_1',
      organizationId: 'org_1',
      stripeCustomerId: 'cus_1',
      billingAccountId: null,
      isDeleted: false,
    });
    accounts.resolveForOrganization.mockResolvedValue({
      id: 'ba_1',
      stripeCustomerId: null,
      isDeleted: false,
    });
    stripe.constructWebhookEvent.mockResolvedValue({
      id: 'evt_1',
      type: 'customer.subscription.created',
      data: { object: created },
    });
    const module = await Test.createTestingModule({
      controllers: [StripeWebhookController],
      providers: [
        StripeWebhookService,
        StripeSubscriptionWebhookHandler,
        StripeInvoiceWebhookHandler,
        StripeWebhookBillingService,
        { provide: PrismaService, useValue: prisma },
        { provide: BillingAccountsService, useValue: accounts },
        { provide: LoggerService, useValue: logger },
        { provide: RedisService, useValue: { getPublisher: () => publisher } },
        { provide: StripeService, useValue: stripe },
        { provide: SUBSCRIPTIONS_SERVICE, useValue: subscriptions },
        {
          provide: StripeSubscriptionCreditReconcilerService,
          useValue: reconciler,
        },
        { provide: StripeWebhookSupportService, useValue: support },
        { provide: UsersService, useValue: { findOne: vi.fn() } },
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

  it('returns one classified warning and 503, releases the acquired key, and retries after repair', async () => {
    accounts.resolveForOrganization.mockResolvedValueOnce(null);
    const response = await request(app.getHttpServer())
      .post('/webhooks/stripe/callback')
      .send({});
    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      errors: [
        {
          status: '503',
          title: 'Service Unavailable',
          detail: 'Stripe webhook billing reconciliation unavailable',
          code: 'identity_missing',
        },
      ],
    });
    expect(logger.warn).toHaveBeenCalledExactlyOnceWith(expect.any(String), {
      code: 'identity_missing',
      errorName: 'StripeWebhookBillingError',
      eventId: 'evt_1',
      eventType: 'customer.subscription.created',
      kind: 'BILLING',
    });
    expect(logger.error).not.toHaveBeenCalled();
    expect(publisher.del).toHaveBeenCalledWith('stripe:webhook:evt_1');
    expect(prisma.subscription.updateMany).not.toHaveBeenCalled();
    expect(reconciler.reconcile).not.toHaveBeenCalled();
    await request(app.getHttpServer())
      .post('/webhooks/stripe/callback')
      .send({})
      .expect(200);
    await request(app.getHttpServer())
      .post('/webhooks/stripe/callback')
      .send({})
      .expect(200);
    expect(prisma.subscription.updateMany).toHaveBeenCalledTimes(1);
    expect(reconciler.reconcile).toHaveBeenCalledTimes(1);
  });
  it.each([0, 2])(
    'stops all dependent writes when guarded persistence count is %s',
    async (count) => {
      prisma.subscription.updateMany.mockResolvedValue({ count });
      await request(app.getHttpServer())
        .post('/webhooks/stripe/callback')
        .send({})
        .expect(503);
      expect(subscriptions.syncSubscriptionState).not.toHaveBeenCalled();
      expect(support.updateOrganizationTierAndModels).not.toHaveBeenCalled();
      expect(reconciler.reconcile).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledTimes(1);
      expect(logger.error).not.toHaveBeenCalled();
    },
  );
  it.each([undefined, '', ' '])(
    'rejects invalid renewal invoice id %j before writes',
    async (id) => {
      stripe.constructWebhookEvent.mockResolvedValue({
        id: 'evt_invoice',
        type: 'invoice.paid',
        data: {
          object: {
            id,
            billing_reason: 'subscription_cycle',
            customer: 'cus_1',
            parent: { subscription_details: { subscription: 'sub_1' } },
          },
        },
      });
      await request(app.getHttpServer())
        .post('/webhooks/stripe/callback')
        .send({})
        .expect(503);
      expect(prisma.subscription.updateMany).not.toHaveBeenCalled();
      expect(reconciler.reconcile).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledTimes(1);
    },
  );
});
