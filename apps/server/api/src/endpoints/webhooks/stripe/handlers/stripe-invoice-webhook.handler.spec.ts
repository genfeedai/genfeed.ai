import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { UsersService } from '@api/collections/users/services/users.service';
import type { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import type { SubscriptionCreditGrantService } from '@api/common/subscriptions/subscription-credit-grant.service';
import { StripeInvoiceWebhookHandler } from '@api/endpoints/webhooks/stripe/handlers/stripe-invoice-webhook.handler';
import { StripeSubscriptionCreditReconcilerService } from '@api/endpoints/webhooks/stripe/handlers/stripe-subscription-credit-reconciler.service';
import type { StripeWebhookSupportService } from '@api/endpoints/webhooks/stripe/handlers/stripe-webhook-support.service';
import { StripeWebhookBillingError } from '@api/endpoints/webhooks/stripe/stripe-webhook-billing.error';
import type { StripeWebhookBillingService } from '@api/endpoints/webhooks/stripe/stripe-webhook-billing.service';
import type { StripeInvoice } from '@api/services/integrations/stripe/services/stripe.service';
import {
  ActivityKey,
  BillingRevenueSource,
  SubscriptionPlan,
  SubscriptionStatus,
  SubscriptionTier,
} from '@genfeedai/contracts';
import type {
  ISubscriptionOssReadModel,
  ISubscriptionsService,
} from '@genfeedai/contracts/interfaces/billing';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it } from 'vitest';

type Row = Record<string, unknown>;

interface Grant {
  amount: number;
  billingAccountId: string;
  metadata: Row;
  organizationId: string;
  plan: string;
  referenceId: string;
  referenceType: string;
}

interface GrantOptions {
  billingAccountId: string;
  metadata: Row;
  referenceId: string;
  referenceType: string;
}

const INVOICE_GRANT = {
  referenceId: 'stripe-invoice:in_123',
  referenceType: 'stripe-invoice:subscription-grant',
};
const INITIAL_GRANT = {
  referenceId: 'stripe-subscription:sub_stripe_1',
  referenceType: 'stripe-subscription:initial-grant',
};

// What each Stripe price grants per billing period.
const PLAN_CREDITS: Record<string, number> = {
  price_pro: 5_900,
  price_scale: 60_000,
  price_scale_yearly: 70_800,
};
const PRICE_TIERS: Record<string, SubscriptionTier> = {
  price_scale: SubscriptionTier.SCALE,
  price_scale_yearly: SubscriptionTier.SCALE,
};

const invoice = (fields: Row = {}): StripeInvoice =>
  ({
    billing_reason: 'subscription_cycle',
    id: 'in_123',
    metadata: {},
    object: 'invoice',
    parent: { subscription_details: { subscription: 'sub_stripe_1' } },
    ...fields,
  }) as unknown as StripeInvoice;

describe('StripeInvoiceWebhookHandler', () => {
  // The subscription and user rows, the credit ledger, and everything else an
  // invoice event leaves behind.
  let subscriptions: ISubscriptionOssReadModel[];
  let users: Row[];
  let grants: Grant[];
  let activities: Row[];
  let revenue: Row[];
  let fees: Row[];
  let operatorNotices: Row[];
  let synced: ISubscriptionOssReadModel[];
  let invalidatedUsers: string[];
  let creditFlags: string[];
  let resolutions: Row[];
  let warnings: string[];
  let errors: string[];
  let isLedgerDown: boolean;
  let hasRacingGrant: boolean;
  let handler: StripeInvoiceWebhookHandler;

  const subscription = () => subscriptions[0];
  const seedSubscription = (
    fields: Partial<ISubscriptionOssReadModel> = {},
  ) => {
    subscriptions.push({
      cancelAtPeriodEnd: false,
      id: 'sub_db_1',
      isDeleted: false,
      organizationId: 'org_1',
      plan: SubscriptionPlan.MONTHLY,
      status: 'active',
      stripePriceId: 'price_pro',
      stripeSubscriptionId: 'sub_stripe_1',
      userId: 'user_1',
      ...fields,
    });
  };

  // The ledger keeps one grant per reference, as its unique index does.
  const grant = (
    organizationId: string,
    amount: number,
    plan: string,
    options: GrantOptions,
  ) => {
    if (isLedgerDown) throw new Error('ledger unavailable');
    if (hasRacingGrant) {
      hasRacingGrant = false;
      grants.push({ ...options, amount, organizationId, plan });
    }
    if (grants.some((row) => row.referenceId === options.referenceId)) {
      throw Object.assign(new Error('Unique constraint failed'), {
        code: 'P2002',
      });
    }
    grants.push({ ...options, amount, organizationId, plan });
  };

  beforeEach(() => {
    subscriptions = [];
    users = [];
    grants = [];
    activities = [];
    revenue = [];
    fees = [];
    operatorNotices = [];
    synced = [];
    invalidatedUsers = [];
    creditFlags = [];
    resolutions = [];
    warnings = [];
    errors = [];
    isLedgerDown = false;
    hasRacingGrant = false;
    seedSubscription();

    const logger = {
      error: (message: string) => {
        errors.push(message);
      },
      log: () => undefined,
      warn: (message: string) => {
        warnings.push(message);
      },
    } as unknown as LoggerService;
    const credits = {
      addOrganizationCreditsWithExpiration: async (
        organizationId: string,
        amount: number,
        plan: string,
        _description: string,
        _expiresAt: Date,
        options: GrantOptions,
      ) => grant(organizationId, amount, plan, options),
      getOrganizationCreditsBalance: async () =>
        grants.reduce((sum, row) => sum + row.amount, 0),
      resetOrganizationCredits: async (
        organizationId: string,
        amount: number,
        plan: string,
        _description: string,
        options: GrantOptions,
      ) => grant(organizationId, amount, plan, options),
    } as unknown as CreditsUtilsService;
    const support = {
      hasSubscriptionCreditGrant: async (
        _organizationId: string,
        lookup: { reference: { referenceId: string } },
      ) =>
        grants.some((row) => row.referenceId === lookup.reference.referenceId),
      isUniqueConstraintError: (error: unknown) =>
        (error as { code?: string })?.code === 'P2002',
      markOnboardingComplete: async (user: Row) => {
        Object.assign(users.find((row) => row.id === user.id) ?? {}, {
          isOnboardingCompleted: true,
        });
      },
      notifyOperatorOfBillingEvent: async (notice: Row) => {
        operatorNotices.push(notice);
      },
      recordCreditsActivity: async (activity: Row) => {
        activities.push(activity);
      },
      recordProcessingFee: async (fee: Row) => {
        fees.push(fee);
      },
      recordRevenueEvent: async (event: Row) => {
        revenue.push(event);
      },
      resolveTierFromPriceId: (priceId: string) => PRICE_TIERS[priceId] ?? null,
      setHasEverHadCredits: async (organizationId: string) => {
        creditFlags.push(organizationId);
      },
    } as unknown as StripeWebhookSupportService;
    const reconciler = new StripeSubscriptionCreditReconcilerService(
      logger,
      credits,
      {
        logUnresolvedGrant: () => undefined,
        resolvePlanCredits: async (_plan: string, priceId?: string | null) =>
          PLAN_CREDITS[priceId ?? ''] ?? null,
      } as unknown as SubscriptionCreditGrantService,
      support,
    );

    handler = new StripeInvoiceWebhookHandler(
      logger,
      {
        findOne: async (where: { stripeSubscriptionId: string }) =>
          subscriptions.find(
            (row) => row.stripeSubscriptionId === where.stripeSubscriptionId,
          ) ?? null,
        patch: async (id: string, data: Partial<ISubscriptionOssReadModel>) =>
          Object.assign(subscriptions.find((row) => row.id === id) ?? {}, data),
        syncSubscriptionState: async (row: ISubscriptionOssReadModel) => {
          synced.push(row);
        },
      } as unknown as ISubscriptionsService,
      {
        findOne: async (where: { id: string }) =>
          users.find((row) => row.id === where.id) ?? null,
      } as unknown as UsersService,
      {
        invalidateForUser: async (userId: string) => {
          invalidatedUsers.push(userId);
        },
      } as unknown as AccessBootstrapCacheService,
      support,
      reconciler,
      {
        persist: async (
          identity: { subscription: ISubscriptionOssReadModel },
          patch: Partial<ISubscriptionOssReadModel>,
        ) => ({
          ...Object.assign(
            subscriptions.find((row) => row.id === identity.subscription.id) ??
              {},
            patch,
          ),
        }),
        // Canonical identity: the subscription row the Stripe id belongs to.
        resolve: async (input: Row) => {
          resolutions.push(input);
          const row = subscriptions.find(
            (candidate) =>
              candidate.stripeSubscriptionId === input.stripeSubscriptionId,
          );
          if (!row) throw new StripeWebhookBillingError('identity_missing');
          return {
            billingAccountId: 'ba_1',
            stripeSubscriptionId: input.stripeSubscriptionId,
            subscription: { ...row },
          };
        },
      } as unknown as StripeWebhookBillingService,
    );
  });

  describe('handleInvoicePaid', () => {
    it.each([
      [
        'a monthly plan as a rolling grant',
        {},
        { amount: 5_900, plan: 'monthly' },
      ],
      [
        'a monthly Scale plan at its own allocation',
        { stripePriceId: 'price_scale' },
        { amount: 60_000, plan: 'monthly' },
      ],
      [
        'a yearly plan as a reset',
        { plan: SubscriptionPlan.YEARLY, stripePriceId: 'price_scale_yearly' },
        { amount: 70_800, plan: 'yearly' },
      ],
    ])('grants %s once per invoice', async (_case, fields, granted) => {
      subscriptions = [];
      seedSubscription(fields);

      await handler.handleInvoicePaid(invoice(), 'test');
      await handler.handleInvoicePaid(invoice(), 'test');

      expect(grants).toEqual([
        expect.objectContaining({
          ...granted,
          ...INVOICE_GRANT,
          billingAccountId: 'ba_1',
          organizationId: 'org_1',
        }),
      ]);
      expect(activities).toHaveLength(1);
      expect(creditFlags).toEqual(['org_1']);
    });

    it('activates the subscription and syncs its state', async () => {
      subscriptions[0] = { ...subscriptions[0], status: 'past_due' };

      await handler.handleInvoicePaid(invoice(), 'test');

      expect(subscription()?.status).toBe(SubscriptionStatus.ACTIVE);
      expect(synced).toEqual([
        expect.objectContaining({
          id: 'sub_db_1',
          status: SubscriptionStatus.ACTIVE,
        }),
      ]);
    });

    it('records a credit activity for the organization grant', async () => {
      await handler.handleInvoicePaid(invoice(), 'test');

      expect(activities).toEqual([
        expect.objectContaining({
          key: ActivityKey.CREDITS_ADD,
          organizationId: 'org_1',
          userId: 'user_1',
          value: '5900',
        }),
      ]);
    });

    it.each([
      [
        'the stated period',
        { period_end: 1_790_086_400, period_start: 1_790_000_000 },
        {
          periodEnd: '2026-09-22T14:13:20.000Z',
          periodStart: '2026-09-21T14:13:20.000Z',
        },
      ],
      [
        'no period for null boundaries',
        { period_end: null, period_start: null },
        {},
      ],
    ])('stamps the grant with %s', async (_case, period, stamped) => {
      await handler.handleInvoicePaid(invoice(period), 'test');

      const { periodEnd, periodStart } = grants[0]?.metadata ?? {};
      expect({ periodEnd, periodStart }).toEqual(stamped);
      expect(warnings).toEqual([]);
    });

    it.each([
      ['the Scale tier label for a known price', 'price_scale', 'Scale'],
      ['no label for an unknown price', 'price_unknown', undefined],
      ['no label without a price', null, undefined],
    ])(
      'records revenue net of tax with %s',
      async (_case, stripePriceId, planLabel) => {
        subscriptions[0] = { ...subscriptions[0], stripePriceId };

        await handler.handleInvoicePaid(
          invoice({
            amount_paid: 4_900,
            currency: 'usd',
            status_transitions: { paid_at: 1_790_000_000 },
            total_taxes: [{ amount: 400 }],
          }),
          'test',
        );

        expect(revenue).toEqual([
          {
            amountMinor: 4_500,
            currency: 'usd',
            occurredAt: new Date(1_790_000_000 * 1000),
            organizationId: 'org_1',
            planLabel,
            source: BillingRevenueSource.SUBSCRIPTION_INVOICE,
            stripeObjectId: 'in_123',
            userId: 'user_1',
          },
        ]);
        expect(fees).toEqual([
          {
            occurredAt: new Date(1_790_000_000 * 1000),
            organizationId: 'org_1',
            payment: { invoiceId: 'in_123' },
            revenueObjectId: 'in_123',
            userId: 'user_1',
          },
        ]);
      },
    );

    it('labels revenue by product tier, never the billing interval', async () => {
      subscriptions[0] = {
        ...subscriptions[0],
        plan: SubscriptionPlan.YEARLY,
        stripePriceId: 'price_scale_yearly',
      };

      await handler.handleInvoicePaid(invoice({ amount_paid: 60_000 }), 'test');

      expect(revenue).toEqual([
        expect.objectContaining({ amountMinor: 60_000, planLabel: 'Scale' }),
      ]);
    });

    it('resolves identity from the expanded customer and subscription metadata', async () => {
      const metadata = {
        billing_account_id: 'ba_1',
        billing_account_type: 'billing_account',
        billing_organization_id: 'org_1',
      };

      await handler.handleInvoicePaid(
        invoice({
          customer: { id: 'cus_1' },
          parent: {
            subscription_details: { metadata, subscription: 'sub_stripe_1' },
          },
        }),
        'test',
      );

      expect(resolutions).toEqual([
        {
          customer: { id: 'cus_1' },
          metadata,
          stripeSubscriptionId: 'sub_stripe_1',
        },
      ]);
    });

    describe('first subscription invoice', () => {
      it('grants the initial allocation and completes onboarding', async () => {
        users.push({ id: 'user_1', isOnboardingCompleted: false });

        await handler.handleInvoicePaid(
          invoice({ billing_reason: 'subscription_create' }),
          'test',
        );

        expect(grants).toEqual([
          expect.objectContaining({ amount: 5_900, ...INITIAL_GRANT }),
        ]);
        expect(users[0]).toEqual({ id: 'user_1', isOnboardingCompleted: true });
        expect(invalidatedUsers).toEqual(['user_1']);
      });

      it('leaves an onboarded user as they are', async () => {
        users.push({ id: 'user_1', isOnboardingCompleted: true });

        await handler.handleInvoicePaid(
          invoice({ billing_reason: 'subscription_create' }),
          'test',
        );

        expect(invalidatedUsers).toEqual([]);
      });

      it('still processes the invoice when the subscription has no user', async () => {
        subscriptions[0] = { ...subscriptions[0], userId: '' };

        await handler.handleInvoicePaid(
          invoice({ billing_reason: 'subscription_create' }),
          'test',
        );

        expect(grants).toHaveLength(1);
        expect(errors).toEqual([
          'test invoice subscription is missing a user id',
        ]);
      });
    });

    it.each([
      [
        'a non-subscription billing reason',
        invoice({ billing_reason: 'manual' }),
      ],
      [
        'a service-scoped subscription',
        invoice({
          parent: {
            subscription_details: {
              metadata: { billing_scope: 'service' },
              subscription: 'sub_stripe_1',
            },
          },
        }),
      ],
    ])('ignores an invoice for %s', async (_case, paid) => {
      await handler.handleInvoicePaid(paid, 'test');

      expect(resolutions).toEqual([]);
      expect(grants).toEqual([]);
      expect(revenue).toEqual([]);
    });

    it('acknowledges an invoice without a subscription id, since a retry cannot add one', async () => {
      await expect(
        handler.handleInvoicePaid(invoice({ parent: undefined }), 'test'),
      ).resolves.toBeUndefined();

      expect(warnings).toEqual([
        'test invoice carries no subscription id, skipping',
      ]);
      expect(resolutions).toEqual([]);
      expect(grants).toEqual([]);
      expect(errors).toEqual([]);
    });

    it.each([
      ['a missing invoice id', { id: undefined }, 'invalid_payload'],
      ['a non-numeric period', { period_end: 'soon' }, 'invalid_payload'],
    ])(
      'rejects %s for Stripe to redeliver, without writes',
      async (_case, fields, code) => {
        await expect(
          handler.handleInvoicePaid(invoice(fields), 'test'),
        ).rejects.toMatchObject({ code });

        expect(grants).toEqual([]);
        expect(errors).toEqual([]);
      },
    );

    it('propagates missing billing identity without logging or writing', async () => {
      subscriptions = [];

      await expect(
        handler.handleInvoicePaid(invoice(), 'test'),
      ).rejects.toMatchObject({ code: 'identity_missing' });

      expect(grants).toEqual([]);
      expect(synced).toEqual([]);
      expect(warnings).toEqual([]);
      expect(errors).toEqual([]);
    });

    it('fails the delivery for Stripe to retry when the ledger is down', async () => {
      isLedgerDown = true;

      await expect(
        handler.handleInvoicePaid(invoice(), 'test'),
      ).rejects.toThrow('ledger unavailable');

      expect(errors).toEqual(['test failed to handle invoice paid']);
      expect(revenue).toEqual([]);
    });

    it.each([
      ['monthly', {}],
      [
        'yearly',
        { plan: SubscriptionPlan.YEARLY, stripePriceId: 'price_scale_yearly' },
      ],
    ])(
      'treats a concurrent delivery that granted the %s credits first as done',
      async (_case, fields) => {
        subscriptions = [];
        seedSubscription(fields);
        hasRacingGrant = true;

        await handler.handleInvoicePaid(invoice(), 'test');

        expect(grants).toHaveLength(1);
        expect(activities).toEqual([]);
        expect(errors).toEqual([]);
        expect(revenue).toHaveLength(1);
      },
    );

    it('grants nothing for a price with no known allocation', async () => {
      subscriptions[0] = {
        ...subscriptions[0],
        stripePriceId: 'price_unknown',
      };

      await handler.handleInvoicePaid(invoice(), 'test');

      expect(grants).toEqual([]);
      expect(subscription()?.status).toBe(SubscriptionStatus.ACTIVE);
    });
  });

  describe('handleInvoicePaymentFailed', () => {
    it.each([
      ['the parent path', invoice()],
      [
        'the legacy subscription field',
        invoice({ parent: undefined, subscription: 'sub_stripe_1' }),
      ],
    ])(
      'marks the subscription found through %s past due',
      async (_case, failed) => {
        await handler.handleInvoicePaymentFailed(failed, 'test');

        expect(subscription()?.status).toBe(SubscriptionStatus.PAST_DUE);
      },
    );

    it.each([
      ['which attempt it was', 2, 2, 'in_123:2'],
      ['the first attempt without a count', undefined, 1, 'in_123:1'],
    ])(
      'tells the operator the amount and %s',
      async (_case, attemptCount, attempt, stripeObjectId) => {
        await handler.handleInvoicePaymentFailed(
          invoice({
            amount_due: 49_900,
            attempt_count: attemptCount,
            currency: 'usd',
          }),
          'test',
        );

        expect(operatorNotices).toEqual([
          {
            amountMinor: 49_900,
            attemptCount: attempt,
            currency: 'usd',
            kind: 'payment_failed',
            organizationId: 'org_1',
            stripeObjectId,
          },
        ]);
      },
    );

    it.each([
      ['carries no subscription id', invoice({ parent: undefined })],
      [
        'names an unknown subscription',
        invoice({
          parent: { subscription_details: { subscription: 'sub_unknown' } },
        }),
      ],
      [
        'belongs to a service-scoped subscription',
        invoice({
          parent: {
            subscription_details: {
              metadata: { billing_scope: 'service' },
              subscription: 'sub_stripe_1',
            },
          },
        }),
      ],
    ])('changes nothing when the invoice %s', async (_case, failed) => {
      await handler.handleInvoicePaymentFailed(failed, 'test');

      expect(subscription()?.status).toBe('active');
      expect(operatorNotices).toEqual([]);
    });

    it('marks an organizationless subscription past due without an operator notice', async () => {
      subscriptions[0] = { ...subscriptions[0], organizationId: '' };

      await handler.handleInvoicePaymentFailed(invoice(), 'test');

      expect(subscription()?.status).toBe(SubscriptionStatus.PAST_DUE);
      expect(operatorNotices).toEqual([]);
    });
  });
});
