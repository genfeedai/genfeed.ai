import type { UsersService } from '@api/collections/users/services/users.service';
import type { StripeSubscriptionCreditReconcilerService } from '@api/endpoints/webhooks/stripe/handlers/stripe-subscription-credit-reconciler.service';
import { StripeSubscriptionWebhookHandler } from '@api/endpoints/webhooks/stripe/handlers/stripe-subscription-webhook.handler';
import type { StripeWebhookSupportService } from '@api/endpoints/webhooks/stripe/handlers/stripe-webhook-support.service';
import { StripeWebhookBillingError } from '@api/endpoints/webhooks/stripe/stripe-webhook-billing.error';
import type { StripeWebhookBillingService } from '@api/endpoints/webhooks/stripe/stripe-webhook-billing.service';
import type { StripeSubscription } from '@api/services/integrations/stripe/services/stripe.service';
import { selectSoftwareSubscriptionItem } from '@api/services/integrations/stripe/services/stripe-software-item.util';
import type { LifecycleEmailService } from '@api/services/lifecycle-emails/lifecycle-email.service';
import {
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
type LogEntry = [string, unknown];

const PERIOD_START = 1_747_321_600;
const PERIOD_END = 1_750_000_000;
const DB_SUBSCRIPTION = {
  cancelAtPeriodEnd: false,
  id: 'sub_db_1',
  isDeleted: false,
  organizationId: 'org_1',
  plan: SubscriptionPlan.MONTHLY,
  status: 'active',
  stripePriceId: 'price_1',
  stripeSubscriptionId: 'sub_stripe_1',
  userId: 'user_1',
} satisfies ISubscriptionOssReadModel;

function stripeSubscription(overrides: Row = {}): StripeSubscription {
  return {
    cancel_at_period_end: false,
    customer: 'cus_123',
    id: 'sub_stripe_1',
    items: {
      data: [
        {
          current_period_end: PERIOD_END,
          current_period_start: PERIOD_START,
          price: { id: 'price_1', recurring: { interval: 'month' } },
        },
      ],
    },
    status: 'active',
    ...overrides,
  } as unknown as StripeSubscription;
}
const withItem = (item: Row) =>
  stripeSubscription({
    items: { data: [{ price: { id: 'price_1' }, ...item }] },
  });

describe('StripeSubscriptionWebhookHandler', () => {
  // Stored state and every effect a Stripe event leaves behind.
  let subscription: Row;
  let users: Set<string>;
  let priceTiers: Map<string, SubscriptionTier>;
  let organizationTiers: Map<string, SubscriptionTier>;
  let identityError: Error | undefined;
  let reconcileError: Error | undefined;
  let lifecycleError: Error | undefined;
  let persisted: Row[];
  let syncs: unknown[][];
  let reconciled: Row[];
  let notifications: Row[];
  let lapsed: Row[];
  let timeline: string[];
  let logs: LogEntry[];
  let warnings: LogEntry[];
  let errors: LogEntry[];
  let handler: StripeSubscriptionWebhookHandler;

  beforeEach(() => {
    subscription = { ...DB_SUBSCRIPTION };
    users = new Set(['user_1']);
    priceTiers = new Map();
    organizationTiers = new Map([['org_1', SubscriptionTier.PRO]]);
    identityError = undefined;
    reconcileError = undefined;
    lifecycleError = undefined;
    persisted = [];
    syncs = [];
    reconciled = [];
    notifications = [];
    lapsed = [];
    timeline = [];
    logs = [];
    warnings = [];
    errors = [];

    const subscriptions = {
      findOne: async ({ stripeSubscriptionId }: Row) =>
        subscription.stripeSubscriptionId === stripeSubscriptionId &&
        !subscription.isDeleted
          ? { ...subscription }
          : null,
      patch: async (id: string, data: Row) => {
        if (id !== subscription.id) throw new Error('subscription not found');
        return Object.assign(subscription, data);
      },
      syncSubscriptionState: async (...args: unknown[]) => {
        syncs.push(args);
      },
    };
    const support = {
      invalidateUserCaches: async (userId: string) => {
        timeline.push(`invalidate:${userId}`);
      },
      notifyOperatorOfBillingEvent: async (event: Row) => {
        notifications.push(event);
      },
      resolveSubscriptionPlan: () => SubscriptionPlan.MONTHLY,
      resolveTierFromPriceId: (priceId: string) =>
        priceTiers.get(priceId) ?? null,
      softwareItem: selectSoftwareSubscriptionItem,
      updateOrganizationTierAndModels: async (
        organizationId: string,
        tier: SubscriptionTier,
      ) => {
        timeline.push(`tier:${tier}`);
        organizationTiers.set(organizationId, tier);
      },
    };
    const billing = {
      persist: async (_identity: unknown, patch: Row) => {
        persisted.push(patch);
        return Object.assign(subscription, patch);
      },
      resolve: async () => {
        if (identityError) throw identityError;
        return { billingAccountId: 'ba_1', subscription: { ...subscription } };
      },
    };

    handler = new StripeSubscriptionWebhookHandler(
      {
        error: (message: string, context: unknown) => {
          errors.push([message, context]);
        },
        log: (message: string, context: unknown) => {
          logs.push([message, context]);
        },
        warn: (message: string, context: unknown) => {
          warnings.push([message, context]);
        },
      } as unknown as LoggerService,
      subscriptions as unknown as ISubscriptionsService,
      {
        findOne: async ({ id }: { id: string }) =>
          users.has(id) ? { id } : null,
      } as unknown as UsersService,
      support as unknown as StripeWebhookSupportService,
      {
        recordSubscriptionLapsed: async (event: Row) => {
          if (lifecycleError) throw lifecycleError;
          lapsed.push(event);
        },
      } as unknown as LifecycleEmailService,
      {
        reconcile: async (input: Row) => {
          if (reconcileError) throw reconcileError;
          reconciled.push(input);
        },
      } as unknown as StripeSubscriptionCreditReconcilerService,
      billing as unknown as StripeWebhookBillingService,
    );
  });

  describe('handleSubscriptionCreated', () => {
    it('persists the subscription, syncs its state and reconciles the initial grant', async () => {
      await handler.handleSubscriptionCreated(stripeSubscription(), 'test');

      expect(subscription).toMatchObject({
        cancelAtPeriodEnd: false,
        currentPeriodEnd: new Date(PERIOD_END * 1000),
        currentPeriodStart: new Date(PERIOD_START * 1000),
        plan: SubscriptionPlan.MONTHLY,
        status: SubscriptionStatus.ACTIVE,
        stripePriceId: 'price_1',
        stripeSubscriptionId: 'sub_stripe_1',
      });
      expect(syncs).toEqual([
        [
          expect.objectContaining({ id: 'sub_db_1' }),
          'sub_stripe_1',
          'price_1',
          'active',
        ],
      ]);
      expect(reconciled).toEqual([
        {
          billingAccountId: 'ba_1',
          billingReason: 'subscription_create',
          periodEnd: new Date(PERIOD_END * 1000),
          periodStart: new Date(PERIOD_START * 1000),
          stripeSubscriptionId: 'sub_stripe_1',
          subscription: expect.objectContaining({
            organizationId: 'org_1',
            plan: SubscriptionPlan.MONTHLY,
            stripePriceId: 'price_1',
          }),
          subscriptionStatus: 'active',
          trigger: 'customer.subscription.created',
          url: 'test',
        },
      ]);
      expect(organizationTiers.get('org_1')).toBe(SubscriptionTier.PRO);
    });

    it('moves the organization to the price tier and announces it by plan name', async () => {
      priceTiers.set('price_1', SubscriptionTier.SCALE);

      await handler.handleSubscriptionCreated(stripeSubscription(), 'test');

      expect(organizationTiers.get('org_1')).toBe(SubscriptionTier.SCALE);
      expect(syncs.at(-1)).toEqual([
        expect.anything(),
        'sub_stripe_1',
        'price_1',
        'active',
        SubscriptionTier.SCALE,
      ]);
      expect(notifications).toEqual([
        {
          kind: 'subscription_created',
          organizationId: 'org_1',
          planLabel: 'Scale',
          stripeObjectId: 'sub_stripe_1',
        },
      ]);
    });

    it('ignores a service-scoped subscription', async () => {
      await handler.handleSubscriptionCreated(
        stripeSubscription({ metadata: { billing_scope: 'service' } }),
        'test',
      );

      expect(persisted).toEqual([]);
      expect(reconciled).toEqual([]);
    });

    it('propagates classified identity errors without nested logs or side effects', async () => {
      identityError = new StripeWebhookBillingError('identity_missing');

      await expect(
        handler.handleSubscriptionCreated(stripeSubscription(), 'test'),
      ).rejects.toMatchObject({ code: 'identity_missing' });

      expect(persisted).toEqual([]);
      expect(reconciled).toEqual([]);
      expect(warnings).toEqual([]);
      expect(errors).toEqual([]);
    });

    it.each([
      ['no software item', { items: { data: [] } }],
      ['an empty price id', { items: { data: [{ price: { id: '' } }] } }],
      ['an unknown status', { status: 'future_status' }],
      [
        'an infinite period end',
        {
          items: {
            data: [
              {
                current_period_end: Number.POSITIVE_INFINITY,
                price: { id: 'price_1' },
              },
            ],
          },
        },
      ],
      [
        'an out-of-range period start',
        {
          items: {
            data: [{ current_period_start: 1e30, price: { id: 'price_1' } }],
          },
        },
      ],
    ])('rejects a payload with %s before any write', async (_case, payload) => {
      await expect(
        handler.handleSubscriptionCreated(stripeSubscription(payload), 'test'),
      ).rejects.toMatchObject({ code: 'invalid_payload' });

      expect(subscription).toEqual(DB_SUBSCRIPTION);
      expect(syncs).toEqual([]);
      expect(reconciled).toEqual([]);
      expect(organizationTiers.get('org_1')).toBe(SubscriptionTier.PRO);
    });

    it.each([
      [
        'a null period start as absent',
        withItem({
          current_period_end: PERIOD_END,
          current_period_start: null,
        }),
        undefined,
        new Date(PERIOD_END * 1000),
      ],
      [
        'timestamp zero as the Unix epoch',
        withItem({ current_period_end: 0, current_period_start: 0 }),
        new Date(0),
        new Date(0),
      ],
    ])('stores %s', async (_case, payload, start, end) => {
      await handler.handleSubscriptionCreated(payload, 'test');

      expect(persisted).toEqual([
        expect.objectContaining({
          currentPeriodEnd: end,
          currentPeriodStart: start,
        }),
      ]);
      expect(reconciled[0]).toMatchObject({ periodEnd: end });
      expect(reconciled[0]?.periodStart).toEqual(start);
    });

    it('propagates reconciliation failures so Stripe can retry the event', async () => {
      reconcileError = new Error('credit ledger unavailable');

      await expect(
        handler.handleSubscriptionCreated(stripeSubscription(), 'test'),
      ).rejects.toBe(reconcileError);

      expect(errors).toEqual([
        [
          expect.stringContaining('failed to handle subscription created'),
          { category: 'reconciliation_failed' },
        ],
      ]);
    });
  });

  describe('handleSubscriptionUpdated', () => {
    it('updates the subscription and tier, then invalidates the user caches', async () => {
      priceTiers.set('price_1', SubscriptionTier.SCALE);

      await handler.handleSubscriptionUpdated(
        stripeSubscription({ cancel_at_period_end: true, status: 'past_due' }),
        'test',
      );

      expect(subscription).toMatchObject({
        cancelAtPeriodEnd: true,
        currentPeriodEnd: new Date(PERIOD_END * 1000),
        status: SubscriptionStatus.PAST_DUE,
      });
      expect(organizationTiers.get('org_1')).toBe(SubscriptionTier.SCALE);
      expect(timeline).toEqual([
        `tier:${SubscriptionTier.SCALE}`,
        'invalidate:user_1',
      ]);
    });

    it('warns and writes nothing when the subscription is unknown', async () => {
      await handler.handleSubscriptionUpdated(
        stripeSubscription({ id: 'sub_unknown', status: 'past_due' }),
        'test',
      );

      expect(warnings).toEqual([
        [
          expect.stringContaining('subscription not found for update'),
          { stripeSubscriptionId: 'sub_unknown' },
        ],
      ]);
      expect(subscription).toEqual(DB_SUBSCRIPTION);
    });
  });

  describe('handleSubscriptionDeleted', () => {
    it('soft-deletes, drops the organization to free, records the lapse, then invalidates caches', async () => {
      await handler.handleSubscriptionDeleted(stripeSubscription(), 'test');

      expect(subscription).toMatchObject({
        cancelAtPeriodEnd: false,
        isDeleted: true,
        status: SubscriptionStatus.CANCELLED,
      });
      expect(organizationTiers.get('org_1')).toBe(SubscriptionTier.FREE);
      expect(timeline).toEqual([
        `tier:${SubscriptionTier.FREE}`,
        'invalidate:user_1',
      ]);
      expect(lapsed).toEqual([
        {
          organizationId: 'org_1',
          subscriptionId: 'sub_stripe_1',
          userId: 'user_1',
        },
      ]);
    });

    it('announces the canceled subscription with the plan it was on', async () => {
      priceTiers.set('price_1', SubscriptionTier.SCALE);

      await handler.handleSubscriptionDeleted(stripeSubscription(), 'test');

      expect(notifications).toEqual([
        {
          kind: 'subscription_canceled',
          organizationId: 'org_1',
          planLabel: 'Scale',
          stripeObjectId: 'sub_stripe_1',
        },
      ]);
    });

    it('keeps deletion successful when lifecycle recording fails', async () => {
      lifecycleError = new Error('lifecycle unavailable');

      await handler.handleSubscriptionDeleted(stripeSubscription(), 'test');

      expect(subscription.isDeleted).toBe(true);
      expect(warnings).toEqual([
        [
          expect.stringContaining(
            'lifecycle email subscription-lapsed recording skipped',
          ),
          { error: 'lifecycle unavailable', subscriptionId: 'sub_stripe_1' },
        ],
      ]);
      expect(logs).toContainEqual([
        expect.stringContaining('subscription deleted successfully'),
        { organizationId: 'org_1', stripeSubscriptionId: 'sub_stripe_1' },
      ]);
      expect(errors).toEqual([]);
    });

    it('stops after the soft delete when the subscription user is gone', async () => {
      users.clear();

      await handler.handleSubscriptionDeleted(stripeSubscription(), 'test');

      expect(subscription.isDeleted).toBe(true);
      expect(organizationTiers.get('org_1')).toBe(SubscriptionTier.PRO);
      expect(lapsed).toEqual([]);
      expect(warnings).toEqual([
        [
          expect.stringContaining('user not found for subscription'),
          { subscriptionId: 'sub_db_1' },
        ],
      ]);
    });

    it('warns and writes nothing when the subscription is unknown', async () => {
      await handler.handleSubscriptionDeleted(
        stripeSubscription({ id: 'sub_unknown' }),
        'test',
      );

      expect(warnings).toEqual([
        [
          expect.stringContaining('subscription not found for deletion'),
          { stripeSubscriptionId: 'sub_unknown' },
        ],
      ]);
      expect(subscription).toEqual(DB_SUBSCRIPTION);
    });
  });
});
