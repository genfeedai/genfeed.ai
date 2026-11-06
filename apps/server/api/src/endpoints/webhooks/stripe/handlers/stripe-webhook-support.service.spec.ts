import type { StripeCheckoutSession } from '@api/services/integrations/stripe/services/stripe.service';
import {
  STRIPE_WORLD_NOW,
  stripeWebhookWorld,
  type WorldRow,
} from '@api-test/fixtures/stripe-webhook.world';
import {
  ActivityKey,
  ActivitySource,
  BillingRevenueSource,
  CreditTransactionCategory,
  SubscriptionPlan,
  SubscriptionTier,
} from '@genfeedai/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = WorldRow;

const NOW = STRIPE_WORLD_NOW;
const ONE_YEAR_LATER = new Date('2027-09-27T00:00:00.000Z');

function world() {
  const w = stripeWebhookWorld();
  return Object.assign(w, { service: w.support });
}

const PRICES = {
  STRIPE_PRICE_SUBSCRIPTION_ENTERPRISE_MONTHLY: 'price_enterprise',
  STRIPE_PRICE_SUBSCRIPTION_PRO_MONTHLY: 'price_pro',
  STRIPE_PRICE_SUBSCRIPTION_SCALE_MONTHLY: 'price_scale',
};

describe('StripeWebhookSupportService', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('resolveCheckoutCredits', () => {
    it.each([
      ['the session metadata credits', { credits: '250' }, undefined, 0, 250],
      ['the admin-configured checkout credits', {}, '500', 0, 500],
      ['the persisted default over a caller fallback', {}, undefined, 1, 1000],
      [
        'the persisted default without a caller fallback',
        {},
        undefined,
        undefined,
        1000,
      ],
    ])(
      'resolves %s',
      async (_name, metadata, configured, fallback, expected) => {
        const w = world();
        Object.assign(w.config, { STRIPE_PAYG_CREDITS: configured });

        await expect(
          w.service.resolveCheckoutCredits(metadata, fallback),
        ).resolves.toBe(expected);
      },
    );
  });

  describe('withCheckoutSessionProcessing', () => {
    it.each([
      [
        'without an actor',
        undefined,
        {
          referenceId: 'cs_managed_1',
          referenceType: 'stripe-checkout-session:managed-inference',
        },
      ],
      [
        'with an actor',
        'user_1',
        {
          actorUserId: 'user_1',
          referenceId: 'cs_managed_1',
          referenceType: 'stripe-checkout-session:managed-inference',
        },
      ],
    ])(
      'builds a checkout-session credit reference %s',
      (_name, actor, expected) => {
        const w = world();

        expect(
          w.service.buildCheckoutSessionCreditReference(
            'managed-inference',
            'cs_managed_1',
            actor,
          ),
        ).toEqual(expected);
      },
    );

    it('runs the callback once under a five-minute session lock and marks the session processed for 30 days', async () => {
      const w = world();
      const runs: string[] = [];
      const run = () =>
        w.service.withCheckoutSessionProcessing(
          'cs_1',
          'user-credit',
          async () => {
            runs.push('ran');
            return 'done';
          },
        );

      await expect(run()).resolves.toBe('done');
      await expect(run()).resolves.toBeNull();

      expect(runs).toEqual(['ran']);
      expect(w.locks).toEqual([
        {
          key: 'stripe-checkout-session:user-credit:lock:cs_1',
          ttlSeconds: 300,
        },
        {
          key: 'stripe-checkout-session:user-credit:lock:cs_1',
          ttlSeconds: 300,
        },
      ]);
      expect([...w.markers.entries()]).toEqual([
        [
          'stripe-checkout-session:user-credit:processed:cs_1',
          {
            options: {
              tags: ['stripe-checkout-session', 'user-credit', 'cs_1'],
              ttl: 2_592_000,
            },
            value: {
              kind: 'user-credit',
              processedAt: NOW.toISOString(),
              sessionId: 'cs_1',
            },
          },
        ],
      ]);
    });

    it('leaves the session unmarked when the callback fails', async () => {
      const w = world();

      await expect(
        w.service.withCheckoutSessionProcessing(
          'cs_1',
          'user-credit',
          async () => {
            throw new Error('grant failed');
          },
        ),
      ).rejects.toThrow('grant failed');

      expect(w.markers.size).toBe(0);
    });

    it('never grants a checkout pack twice when the Redis marker cannot be written', async () => {
      const w = world();
      w.faults.marker.push(new Error('redis unavailable'), false);
      const reference = w.service.buildCheckoutSessionCreditReference(
        'organization-payment',
        'cs_retry_1',
      );
      const runGrant = () =>
        w.service.withCheckoutSessionProcessing(
          'cs_retry_1',
          'organization-payment',
          () =>
            w.service.addPurchasedCredits(
              'org_1',
              100,
              'pay-as-you-go',
              'Credit pack purchase (100 credits)',
              reference,
            ),
        );

      await expect(runGrant()).resolves.toBe(true);
      await expect(runGrant()).resolves.toBe(false);

      expect(w.ledger).toEqual([
        expect.objectContaining({
          amount: 100,
          organizationId: 'org_1',
          referenceId: 'cs_retry_1',
          referenceType: 'stripe-checkout-session:organization-payment',
        }),
      ]);
      expect(w.markers.size).toBe(0);
      expect(w.logs).toEqual([
        {
          level: 'warn',
          message:
            'StripeWebhookSupportService failed to cache Stripe checkout processed marker',
          meta: {
            error: 'redis unavailable',
            kind: 'organization-payment',
            sessionId: 'cs_retry_1',
          },
        },
        {
          level: 'log',
          message:
            'StripeWebhookSupportService skipping duplicate purchased credit grant',
          meta: {
            organizationId: 'org_1',
            referenceId: 'cs_retry_1',
            referenceType: 'stripe-checkout-session:organization-payment',
            source: 'pay-as-you-go',
          },
        },
        {
          level: 'warn',
          message:
            'StripeWebhookSupportService failed to cache Stripe checkout processed marker',
          meta: { kind: 'organization-payment', sessionId: 'cs_retry_1' },
        },
      ]);
    });
  });

  describe('addPurchasedCredits', () => {
    const REFERENCE = {
      actorUserId: 'user_1',
      referenceId: 'cs_1',
      referenceType: 'stripe-checkout-session:organization-payment',
    };

    it('grants credits that expire one year later', async () => {
      const w = world();

      await expect(
        w.service.addPurchasedCredits('org_1', 100, 'pay-as-you-go', 'desc'),
      ).resolves.toBe(true);

      expect(w.ledger).toEqual([
        {
          amount: 100,
          category: CreditTransactionCategory.ADD,
          createdAt: NOW,
          description: 'desc',
          expiresAt: ONE_YEAR_LATER,
          isDeleted: false,
          organizationId: 'org_1',
          source: 'pay-as-you-go',
        },
      ]);
    });

    it('records the checkout session and buyer on a referenced grant', async () => {
      const w = world();

      await w.service.addPurchasedCredits(
        'org_1',
        100,
        'pay-as-you-go',
        'desc',
        REFERENCE,
      );

      expect(w.ledger).toEqual([
        expect.objectContaining({
          actorUserId: 'user_1',
          expiresAt: ONE_YEAR_LATER,
          metadata: {
            stripeCheckoutSessionId: 'cs_1',
            stripeCheckoutSessionType:
              'stripe-checkout-session:organization-payment',
          },
          referenceId: 'cs_1',
          referenceType: 'stripe-checkout-session:organization-payment',
        }),
      ]);
    });

    it.each<[string, Row, number]>([
      ['an ADD row for the same session and source', {}, 1],
      ['a deleted earlier row', { isDeleted: true }, 2],
      ['a row from another source', { source: 'subscription' }, 2],
      [
        'a RESET row under the same unique key',
        { category: CreditTransactionCategory.RESET },
        1,
      ],
      ['a row of another organization', { organizationId: 'org_2' }, 2],
    ])(
      'leaves %s at %s ledger row(s) after the grant',
      async (_name, overrides, rows) => {
        const w = world();
        w.ledger.push({
          category: CreditTransactionCategory.ADD,
          id: 'txn_1',
          isDeleted: false,
          organizationId: 'org_1',
          referenceId: 'cs_1',
          referenceType: REFERENCE.referenceType,
          source: 'pay-as-you-go',
          ...overrides,
        });

        await w.service.addPurchasedCredits(
          'org_1',
          100,
          'pay-as-you-go',
          'desc',
          { referenceId: 'cs_1', referenceType: REFERENCE.referenceType },
        );

        expect(w.ledger).toHaveLength(rows);
      },
    );

    it('skips a grant that a concurrent delivery wrote first', async () => {
      const w = world();
      w.races.beforeGrant = () => {
        w.ledger.push({
          category: CreditTransactionCategory.ADD,
          organizationId: 'org_1',
          referenceId: 'cs_1',
          referenceType: REFERENCE.referenceType,
          source: 'pay-as-you-go',
        });
      };

      await expect(
        w.service.addPurchasedCredits(
          'org_1',
          100,
          'pay-as-you-go',
          'desc',
          REFERENCE,
        ),
      ).resolves.toBe(false);

      expect(w.ledger).toHaveLength(1);
    });

    it.each([
      [
        'an unreferenced grant that hits a unique key',
        { code: 'P2002' },
        undefined,
      ],
      [
        'a referenced grant that fails otherwise',
        new Error('db down'),
        REFERENCE,
      ],
    ])('rethrows %s', async (_name, fault, reference) => {
      const w = world();
      w.faults.grant.push(fault);

      await expect(
        w.service.addPurchasedCredits(
          'org_1',
          100,
          'pay-as-you-go',
          'desc',
          reference,
        ),
      ).rejects.toBe(fault);
    });
  });

  describe('hasSubscriptionCreditGrant', () => {
    const PERIOD = {
      end: new Date('2026-08-01T00:00:00.000Z'),
      source: 'monthly',
      start: new Date('2026-07-01T00:00:00.000Z'),
    };
    const LOOKUP = {
      legacyInvoiceReference: {
        referenceId: 'stripe-invoice:in_old',
        referenceType: 'stripe-invoice:subscription-grant',
      },
      legacyPeriod: PERIOD,
      reference: {
        referenceId: 'stripe-subscription:sub_123',
        referenceType: 'stripe-subscription:initial-grant',
      },
    };
    const grant = (overrides: Row): Row => ({
      category: CreditTransactionCategory.ADD,
      createdAt: new Date('2026-07-15T00:00:00.000Z'),
      isDeleted: false,
      organizationId: 'org_1',
      referenceId: 'unrelated',
      referenceType: 'unrelated',
      source: 'monthly',
      ...overrides,
    });

    it.each<[string, Row[], boolean]>([
      ['no ledger row', [], false],
      [
        'a yearly RESET row under the exact reference',
        [
          grant({
            category: CreditTransactionCategory.RESET,
            referenceId: 'stripe-subscription:sub_123',
            referenceType: 'stripe-subscription:initial-grant',
          }),
        ],
        true,
      ],
      [
        'the legacy invoice reference',
        [
          grant({
            referenceId: 'stripe-invoice:in_old',
            referenceType: 'stripe-invoice:subscription-grant',
          }),
        ],
        true,
      ],
      [
        'a legacy invoice grant inside the period',
        [grant({ referenceType: 'stripe-invoice:subscription-grant' })],
        true,
      ],
      [
        'a legacy invoice grant at the period end',
        [
          grant({
            createdAt: PERIOD.end,
            referenceType: 'stripe-invoice:subscription-grant',
          }),
        ],
        false,
      ],
      [
        'a legacy invoice grant from another source',
        [
          grant({
            referenceType: 'stripe-invoice:subscription-grant',
            source: 'yearly',
          }),
        ],
        false,
      ],
      [
        'a matching grant of another organization',
        [
          grant({
            organizationId: 'org_2',
            referenceId: 'stripe-subscription:sub_123',
            referenceType: 'stripe-subscription:initial-grant',
          }),
        ],
        false,
      ],
      [
        'a deleted matching grant',
        [
          grant({
            isDeleted: true,
            referenceId: 'stripe-subscription:sub_123',
            referenceType: 'stripe-subscription:initial-grant',
          }),
        ],
        false,
      ],
    ])('answers %s with %s', async (_name, rows, expected) => {
      const w = world();
      w.ledger.push(...rows);

      await expect(
        w.service.hasSubscriptionCreditGrant('org_1', LOOKUP),
      ).resolves.toBe(expected);
    });

    it('ignores the legacy invoice reference when the lookup has none', async () => {
      const w = world();
      w.ledger.push(
        grant({
          referenceId: 'stripe-invoice:in_old',
          referenceType: 'stripe-invoice:subscription-grant',
        }),
      );

      await expect(
        w.service.hasSubscriptionCreditGrant('org_1', {
          reference: LOOKUP.reference,
        }),
      ).resolves.toBe(false);
    });
  });

  describe('isUniqueConstraintError', () => {
    it.each([
      [{ code: 'P2002' }, true],
      [{ code: 'P2025' }, false],
      [new Error('boom'), false],
      [null, false],
      [undefined, false],
    ])('classifies %o as %s', (error, expected) => {
      expect(world().service.isUniqueConstraintError(error)).toBe(expected);
    });
  });

  describe('recordCreditsActivity', () => {
    it.each([
      [
        'a user and brand entry, defaulting to credits added',
        {
          brandId: 'brand_1',
          organizationId: 'org_1',
          source: ActivitySource.PAY_AS_YOU_GO,
          userId: 'user_1',
          value: '100',
        },
        {
          brandId: 'brand_1',
          key: ActivityKey.CREDITS_ADD,
          organizationId: 'org_1',
          source: ActivitySource.PAY_AS_YOU_GO,
          userId: 'user_1',
          value: '100',
        },
      ],
      [
        'an organization-wide entry with its own key',
        {
          key: ActivityKey.CREDITS_RESET,
          organizationId: 'org_1',
          source: ActivitySource.SUBSCRIPTION,
          value: 'Subscription credits reset',
        },
        {
          key: ActivityKey.CREDITS_RESET,
          organizationId: 'org_1',
          source: ActivitySource.SUBSCRIPTION,
          value: 'Subscription credits reset',
        },
      ],
    ])('records %s', async (_name, input, expected) => {
      const w = world();

      await w.service.recordCreditsActivity(input);

      expect(w.journal).toEqual([`activity ${JSON.stringify(expected)}`]);
    });
  });

  describe('onboarding', () => {
    const SESSION = {
      customer: 'cus_123',
      customer_details: { email: 'ada@example.com' },
      id: 'cs_1',
    } as unknown as StripeCheckoutSession;

    it('completes onboarding for an incomplete user and leaves a completed one alone', async () => {
      const w = world();
      w.users.push(
        { id: 'user_1', isOnboardingCompleted: false },
        { id: 'user_2', isOnboardingCompleted: true },
      );

      await w.service.markOnboardingComplete({
        id: 'user_1',
        isOnboardingCompleted: false,
      });
      await w.service.markOnboardingComplete({
        id: 'user_2',
        isOnboardingCompleted: true,
      });

      expect(w.users).toEqual([
        {
          id: 'user_1',
          isOnboardingCompleted: true,
          onboardingCompletedAt: NOW,
          onboardingStepsCompleted: ['brand', 'providers', 'summary'],
        },
        { id: 'user_2', isOnboardingCompleted: true },
      ]);
    });

    it.each<[string, (w: ReturnType<typeof world>) => void]>([
      [
        'the subscription owner',
        (w) => {
          w.subscriptions.push({
            organizationId: 'org_1',
            stripeCustomerId: 'cus_123',
            userId: 'user_1',
          });
          w.users.push({ email: 'other@example.com', id: 'user_1' });
        },
      ],
      [
        'the checkout email when no subscription names a user',
        (w) => w.users.push({ email: 'ada@example.com', id: 'user_1' }),
      ],
    ])(
      'completes onboarding for %s, then refreshes their caches',
      async (_name, arrange) => {
        const w = world();
        arrange(w);

        await w.service.markOnboardingCompleteFromSession(SESSION, 'test');

        expect(w.users[0]).toMatchObject({ isOnboardingCompleted: true });
        expect(w.journal).toEqual([
          'user user_1',
          'invalidate request-context user user_1',
          'invalidate access-bootstrap user user_1',
        ]);
        expect(w.logs).toEqual([
          {
            level: 'log',
            message: 'test onboarding marked complete',
            meta: expect.objectContaining({
              sessionId: 'cs_1',
              userId: 'user_1',
            }),
          },
        ]);
        expect(w.logs[0]?.meta).not.toHaveProperty('email');
      },
    );

    it('warns with only the email domain when no user can be found', async () => {
      const w = world();

      await w.service.markOnboardingCompleteFromSession(SESSION, 'test');

      expect(w.journal).toEqual([]);
      expect(w.logs).toEqual([
        {
          level: 'warn',
          message: 'test could not find user for onboarding completion',
          meta: {
            customerId: 'cus_123',
            emailDomain: 'example.com',
            sessionId: 'cs_1',
          },
        },
      ]);
    });
  });

  describe('organization settings', () => {
    function withSettings() {
      const w = world();
      w.settings.push({ id: 'os_1', organizationId: 'org_1' });
      return w;
    }

    it('flags that the organization has had credits, then refreshes its caches', async () => {
      const w = withSettings();

      await w.service.setHasEverHadCredits('org_1', 'test');

      expect(w.settings).toEqual([
        { hasEverHadCredits: true, id: 'os_1', organizationId: 'org_1' },
      ]);
      expect(w.journal).toEqual([
        'settings os_1',
        'invalidate request-context org org_1',
        'invalidate access-bootstrap org org_1',
      ]);
    });

    it('warns instead of throwing when the credits flag cannot be written', async () => {
      const w = withSettings();
      w.faults.settingsPatch.push(new Error('boom'));

      await expect(
        w.service.setHasEverHadCredits('org_1', 'test'),
      ).resolves.toBeUndefined();

      expect(w.journal).toEqual([]);
      expect(w.logs).toEqual([
        {
          level: 'warn',
          message: 'test failed to set hasEverHadCredits flag',
          meta: { error: 'boom', organizationId: 'org_1' },
        },
      ]);
    });

    it('moves the organization to its new tier with the latest models, then refreshes its caches', async () => {
      const w = withSettings();

      await w.service.updateOrganizationTierAndModels(
        'org_1',
        SubscriptionTier.SCALE,
        'test',
      );

      expect(w.settings).toEqual([
        {
          enabledModelIds: ['model_1', 'model_2'],
          id: 'os_1',
          organizationId: 'org_1',
          subscriptionTier: SubscriptionTier.SCALE,
        },
      ]);
      expect(w.journal).toEqual([
        'settings os_1',
        'invalidate request-context org org_1',
        'invalidate access-bootstrap org org_1',
      ]);
    });

    it.each([
      [
        'setHasEverHadCredits',
        (w: ReturnType<typeof world>) =>
          w.service.setHasEverHadCredits('org_1', 'test'),
      ],
      [
        'updateOrganizationTierAndModels',
        (w: ReturnType<typeof world>) =>
          w.service.updateOrganizationTierAndModels(
            'org_1',
            SubscriptionTier.PRO,
            'test',
          ),
      ],
    ])(
      '%s changes nothing for an organization without settings',
      async (_name, act) => {
        const w = world();

        await act(w);

        expect(w.settings).toEqual([]);
        expect(w.journal).toEqual([]);
      },
    );

    it('logs a failed tier update instead of throwing', async () => {
      const w = withSettings();
      w.faults.settingsPatch.push(new Error('boom'));

      await expect(
        w.service.updateOrganizationTierAndModels(
          'org_1',
          SubscriptionTier.SCALE,
          'test',
        ),
      ).resolves.toBeUndefined();

      expect(w.settings).toEqual([{ id: 'os_1', organizationId: 'org_1' }]);
      expect(w.logs.map((entry) => entry.message)).toEqual([
        'test failed to update org tier/models',
      ]);
    });

    it('refreshes both caches of a user and of an organization', async () => {
      const w = world();

      await w.service.invalidateUserCaches('user_1');
      await w.service.invalidateOrganizationCaches('org_1');

      expect(w.journal).toEqual([
        'invalidate request-context user user_1',
        'invalidate access-bootstrap user user_1',
        'invalidate request-context org org_1',
        'invalidate access-bootstrap org org_1',
      ]);
    });
  });

  describe('plans and tiers', () => {
    it.each([
      ['price_enterprise', undefined, SubscriptionPlan.ENTERPRISE],
      ['price_pro', undefined, SubscriptionPlan.MONTHLY],
      ['price_scale', 'year', SubscriptionPlan.MONTHLY],
      ['price_unknown', 'year', SubscriptionPlan.YEARLY],
    ] as const)('maps %s (%s) to the %s plan', (price, interval, plan) => {
      const w = world();
      Object.assign(w.config, PRICES);

      expect(w.service.resolveSubscriptionPlan(price, interval)).toBe(plan);
      expect(w.logs).toEqual([]);
    });

    it('defaults an unknown monthly price to the monthly plan with a warning', () => {
      const w = world();

      expect(w.service.resolveSubscriptionPlan('price_unknown')).toBe(
        SubscriptionPlan.MONTHLY,
      );
      expect(w.logs).toEqual([
        {
          level: 'warn',
          message:
            'StripeWebhookSupportService unknown price ID, defaulting to monthly',
          meta: { stripePriceId: 'price_unknown' },
        },
      ]);
    });

    // The mapping has one owner, SubscriptionCreditGrantService; a second copy
    // here is what let a webhook and a grant disagree on a tier.
    it.each([
      ['price_pro', SubscriptionTier.PRO],
      ['price_scale', SubscriptionTier.SCALE],
      ['price_enterprise', SubscriptionTier.ENTERPRISE],
      ['price_unknown', null],
    ])('resolves %s to the tier the credit grant uses (%s)', (price, tier) => {
      const w = world();
      Object.assign(w.config, PRICES);

      expect(w.service.resolveTierFromPriceId(price)).toBe(tier);
    });
  });

  describe('recordRevenueEvent (genfeedai/genfeed.ai#4969)', () => {
    const INPUT = {
      amountMinor: 4900,
      currency: 'usd',
      occurredAt: NOW,
      organizationId: 'org_1',
      source: BillingRevenueSource.CREDIT_PURCHASE,
      stripeObjectId: 'cs_test_1',
      userId: 'user_1',
    };
    const alert = (payload: Row) => ({
      deduplicationKey: 'message.revenue/cs_test_1',
      messages: [
        {
          destination: null,
          message: { action: 'revenue_notification', payload, type: 'discord' },
        },
      ],
      occurredAt: NOW,
      organizationId: 'org_1',
      source: { id: 'cs_test_1', type: 'stripe_revenue' },
      topic: 'operator.alerts',
    });

    it('books the payment once and alerts the operator once across webhook replays', async () => {
      const w = world();

      await w.service.recordRevenueEvent({
        ...INPUT,
        amountMinor: 4899.6,
        currency: ' USD ',
      });
      await w.service.recordRevenueEvent(INPUT);

      expect(w.revenue).toEqual([
        {
          amountMinor: 4900,
          currency: 'usd',
          isDeleted: false,
          occurredAt: NOW,
          organizationId: 'org_1',
          source: BillingRevenueSource.CREDIT_PURCHASE,
          stripeObjectId: 'cs_test_1',
          userId: 'user_1',
        },
      ]);
      expect(w.alerts).toEqual([
        alert({
          amountMinor: 4900,
          currency: 'usd',
          organizationId: 'org_1',
          organizationLabel: 'Acme Studio',
          planLabel: undefined,
          source: BillingRevenueSource.CREDIT_PURCHASE,
          userId: 'user_1',
        }),
      ]);
      expect(w.delivered).toEqual(['delivery_1']);
    });

    it('carries the plan label of subscription revenue and books an anonymous payment', async () => {
      const w = world();

      await w.service.recordRevenueEvent({
        ...INPUT,
        planLabel: 'pro',
        source: BillingRevenueSource.SUBSCRIPTION_INVOICE,
        userId: undefined,
      });

      expect(w.revenue).toEqual([expect.objectContaining({ userId: null })]);
      expect(w.alerts).toEqual([
        alert({
          amountMinor: 4900,
          currency: 'usd',
          organizationId: 'org_1',
          organizationLabel: 'Acme Studio',
          planLabel: 'pro',
          source: BillingRevenueSource.SUBSCRIPTION_INVOICE,
          userId: undefined,
        }),
      ]);
    });

    it('still books and alerts when the organization name cannot be read', async () => {
      const w = world();
      w.faults.organizationLookup.push(new Error('db blip'));

      await w.service.recordRevenueEvent(INPUT);

      expect(w.revenue).toHaveLength(1);
      expect(w.alerts).toEqual([
        alert(expect.objectContaining({ organizationLabel: undefined })),
      ]);
      expect(w.delivered).toEqual(['delivery_1']);
    });

    it.each([
      ['the ledger write fails', 'revenueWrite'],
      ['the alert write fails', 'alert'],
    ] as const)(
      'books nothing, alerts nothing and never throws when %s',
      async (_name, fault) => {
        const w = world();
        w.faults[fault].push(new Error('db down'));

        await expect(
          w.service.recordRevenueEvent(INPUT),
        ).resolves.toBeUndefined();

        expect(w.revenue).toEqual([]);
        expect(w.alerts).toEqual([]);
        expect(w.delivered).toEqual([]);
        expect(w.logs).toEqual([
          {
            level: 'error',
            message:
              'StripeWebhookSupportService failed to record revenue event',
            meta: expect.objectContaining({ stripeObjectId: 'cs_test_1' }),
          },
        ]);
      },
    );

    it.each([
      ['a zero amount', { amountMinor: 0 }],
      ['a negative amount', { amountMinor: -100 }],
      ['a non-numeric amount', { amountMinor: Number.NaN }],
      ['no organization', { organizationId: '' }],
      ['no Stripe object', { stripeObjectId: '' }],
    ])('books nothing for %s', async (_name, overrides) => {
      const w = world();

      await w.service.recordRevenueEvent({ ...INPUT, ...overrides });

      expect(w.revenue).toEqual([]);
      expect(w.alerts).toEqual([]);
    });
  });

  describe('notifyOperatorOfBillingEvent', () => {
    const CREATED = {
      kind: 'subscription_created' as const,
      organizationId: 'org_1',
      planLabel: 'Scale',
      stripeObjectId: 'sub_1',
    };

    it('queues and delivers a billing card that names the organization', async () => {
      const w = world();

      await w.service.notifyOperatorOfBillingEvent(CREATED);

      expect(w.alerts).toEqual([
        {
          deduplicationKey: 'message.billing/subscription_created/sub_1',
          messages: [
            {
              destination: null,
              message: {
                action: 'billing_event',
                payload: {
                  kind: 'subscription_created',
                  organizationId: 'org_1',
                  organizationLabel: 'Acme Studio',
                  planLabel: 'Scale',
                },
                type: 'discord',
              },
            },
          ],
          organizationId: 'org_1',
          source: { id: 'sub_1', type: 'stripe_billing_event' },
          topic: 'operator.alerts',
        },
      ]);
      expect(w.delivered).toEqual(['delivery_1']);
    });

    it('still queues the card without a name when the organization cannot be read', async () => {
      const w = world();
      w.faults.organizationLookup.push(new Error('db blip'));

      await w.service.notifyOperatorOfBillingEvent(CREATED);

      expect(w.alerts).toEqual([
        expect.objectContaining({
          messages: [
            expect.objectContaining({
              message: expect.objectContaining({
                payload: {
                  kind: 'subscription_created',
                  organizationId: 'org_1',
                  organizationLabel: undefined,
                  planLabel: 'Scale',
                },
              }),
            }),
          ],
        }),
      ]);
    });

    it('logs instead of throwing when the outbox write fails', async () => {
      const w = world();
      w.faults.alert.push(new Error('outbox down'));

      await expect(
        w.service.notifyOperatorOfBillingEvent(CREATED),
      ).resolves.toBeUndefined();

      expect(w.alerts).toEqual([]);
      expect(w.logs.map((entry) => entry.message)).toEqual([
        'StripeWebhookSupportService failed to queue billing event alert',
      ]);
    });
  });

  describe('recordRevenueAdjustment', () => {
    const REFUND = {
      adjustedGrossMinor: 1_000,
      adjustmentId: 're_1',
      occurredAt: new Date('2026-11-03T00:00:00.000Z'),
      originalGrossMinor: 4_900,
      originalStripeObjectId: 'cs_test_1',
      source: BillingRevenueSource.REFUND as
        | BillingRevenueSource.REFUND
        | BillingRevenueSource.DISPUTE,
    };
    function booked() {
      const w = world();
      // 4,900 gross paid, 4,000 net of tax booked.
      w.revenue.push({
        amountMinor: 4_000,
        currency: 'usd',
        isDeleted: false,
        organizationId: 'org_1',
        source: BillingRevenueSource.CREDIT_PURCHASE,
        stripeObjectId: 'cs_test_1',
        userId: 'user_1',
      });
      return w;
    }
    const adjustments = (w: ReturnType<typeof world>) =>
      w.revenue
        .slice(1)
        .map((row) => `${row.stripeObjectId}=${row.amountMinor}`);

    it('takes the net share of a refund out of revenue and announces it once across replays', async () => {
      const w = booked();

      await w.service.recordRevenueAdjustment(REFUND);
      await w.service.recordRevenueAdjustment(REFUND);

      expect(w.revenue[1]).toEqual({
        amountMinor: -816,
        currency: 'usd',
        isDeleted: false,
        occurredAt: REFUND.occurredAt,
        organizationId: 'org_1',
        source: BillingRevenueSource.REFUND,
        stripeObjectId: 're_1:1000',
        userId: 'user_1',
      });
      expect(adjustments(w)).toEqual(['re_1:1000=-816']);
      expect(w.alerts).toEqual([
        expect.objectContaining({
          deduplicationKey: 'message.billing/refund/re_1:1000',
          messages: [
            expect.objectContaining({
              message: expect.objectContaining({
                payload: {
                  amountMinor: 1_000,
                  currency: 'usd',
                  kind: 'refund',
                  organizationId: 'org_1',
                  organizationLabel: 'Acme Studio',
                },
              }),
            }),
          ],
        }),
      ]);
    });

    it('books only the remainder of a cumulative refund', async () => {
      const w = booked();

      await w.service.recordRevenueAdjustment(REFUND);
      await w.service.recordRevenueAdjustment({
        ...REFUND,
        adjustedGrossMinor: 2_000,
      });

      // 2,000 of 4,900 gross is 1,633 net; 816 was already taken out.
      expect(adjustments(w)).toEqual(['re_1:1000=-816', 're_1:2000=-817']);
      expect(w.alerts).toHaveLength(2);
    });

    it('caps a dispute larger than the payment at the whole net amount and announces it as a dispute', async () => {
      const w = booked();

      await w.service.recordRevenueAdjustment({
        ...REFUND,
        adjustedGrossMinor: 9_000,
        adjustmentId: 'dp_1',
        source: BillingRevenueSource.DISPUTE,
      });

      expect(adjustments(w)).toEqual(['dp_1:9000=-4000']);
      expect(w.alerts).toEqual([
        expect.objectContaining({
          deduplicationKey: 'message.billing/dispute/dp_1:9000',
        }),
      ]);
    });

    it('books nothing for a payment the ledger never recorded', async () => {
      const w = world();

      await w.service.recordRevenueAdjustment(REFUND);

      expect(w.revenue).toEqual([]);
      expect(w.alerts).toEqual([]);
      expect(w.logs).toEqual([
        {
          level: 'warn',
          message: 'StripeWebhookSupportService no revenue row to adjust',
          meta: { adjustmentId: 're_1', originalStripeObjectId: 'cs_test_1' },
        },
      ]);
    });

    it('logs instead of throwing when the adjustment cannot be written', async () => {
      const w = booked();
      w.faults.revenueWrite.push(new Error('db down'));

      await expect(
        w.service.recordRevenueAdjustment(REFUND),
      ).resolves.toBeUndefined();

      expect(adjustments(w)).toEqual([]);
      expect(w.alerts).toEqual([]);
      expect(w.logs.map((entry) => entry.message)).toEqual([
        'StripeWebhookSupportService failed to record revenue adjustment',
      ]);
    });
  });

  describe('recordProcessingFee', () => {
    const FEE_INPUT = {
      occurredAt: NOW,
      organizationId: 'org_1',
      payment: { invoiceId: 'in_1' },
      revenueObjectId: 'in_1',
      userId: 'user_1',
    };

    it('takes the Stripe fee out of revenue once across replays', async () => {
      const w = world();
      w.fees.set('in_1', { currency: 'USD', feeMinor: 145.4 });

      await w.service.recordProcessingFee(FEE_INPUT);
      await w.service.recordProcessingFee(FEE_INPUT);

      expect(w.revenue).toEqual([
        {
          amountMinor: -145,
          currency: 'usd',
          isDeleted: false,
          occurredAt: NOW,
          organizationId: 'org_1',
          source: BillingRevenueSource.PROCESSING_FEE,
          stripeObjectId: 'fee:in_1',
          userId: 'user_1',
        },
      ]);
    });

    it.each<[string, (w: ReturnType<typeof world>) => void]>([
      ['no fee is known', () => undefined],
      [
        'the fee is zero',
        (w) => w.fees.set('pi_1', { currency: 'usd', feeMinor: 0 }),
      ],
      [
        'the Stripe lookup fails',
        (w) => w.fees.set('pi_1', new Error('stripe down')),
      ],
    ])('books nothing when %s', async (_name, arrange) => {
      const w = world();
      arrange(w);

      await expect(
        w.service.recordProcessingFee({
          ...FEE_INPUT,
          payment: { paymentIntentId: 'pi_1' },
        }),
      ).resolves.toBeUndefined();

      expect(w.revenue).toEqual([]);
    });
  });
});
