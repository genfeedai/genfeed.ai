import { BETTER_AUTH_USER_CREATED_EVENT } from '@api/auth/better-auth/better-auth.constants';
import type { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import type { BrandsService } from '@api/collections/brands/services/brands.service';
import type { CustomersService } from '@api/collections/customers/services/customers.service';
import type { OrganizationsService } from '@api/collections/organizations/services/organizations.service';
import type { ReferralsService } from '@api/collections/referrals/services/referrals.service';
import type { UserSetupService } from '@api/collections/users/services/user-setup.service';
import type { StripeAttributionTrackerService } from '@api/endpoints/webhooks/stripe/handlers/stripe-attribution-tracker.service';
import { StripeCheckoutWebhookHandler } from '@api/endpoints/webhooks/stripe/handlers/stripe-checkout-webhook.handler';
import type { ManagedStripeCheckoutService } from '@api/services/integrations/stripe/services/managed-stripe-checkout.service';
import type { StripeCheckoutSession } from '@api/services/integrations/stripe/services/stripe.service';
import {
  MANAGED_API_KEY_LABEL,
  MANAGED_API_KEY_SCOPES,
} from '@api/services/integrations/stripe/stripe.constants';
import type { LifecycleEmailService } from '@api/services/lifecycle-emails/lifecycle-email.service';
import type { NotificationsService } from '@api/services/notifications/notifications.service';
import {
  STRIPE_WORLD_NOW,
  stripeWebhookWorld,
  type WorldRow,
} from '@api-test/fixtures/stripe-webhook.world';
import {
  ActivitySource,
  ApiKeyCategory,
  ApiKeyScope,
  BillingRevenueSource,
  OrganizationCategory,
} from '@genfeedai/contracts';
import type { IUserSubscriptionsService } from '@genfeedai/contracts/interfaces/billing';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const CREATED = 1_790_000_000;
const CREATED_AT = new Date(CREATED * 1000);

function checkout(fields: WorldRow): StripeCheckoutSession {
  return {
    created: CREATED,
    currency: 'usd',
    ...fields,
  } as unknown as StripeCheckoutSession;
}

/**
 * The shared Stripe world (ledger, revenue, outbox, markers, users, settings,
 * receipts) behind the real `StripeWebhookSupportService`, plus in-memory
 * accounts, API keys, managed-checkout state and the side channels the
 * checkout handler writes to.
 */
function world() {
  const w = stripeWebhookWorld();
  const state = {
    apiKeys: [] as WorldRow[],
    attributions: [] as WorldRow[],
    brands: [] as WorldRow[],
    checkoutsSeen: [] as string[],
    customers: new Map<string, string>(),
    emails: [] as WorldRow[],
    events: [] as WorldRow[],
    /** Scopes of managed keys the next account setups already issued. */
    keyOnSetup: [] as ApiKeyScope[][],
    managed: {
      faults: {
        cache: [] as Array<Error | false>,
        mark: [] as Array<Error | false>,
      },
      isLocked: false,
      provisioned: new Set<string>(),
      results: new Map<string, unknown>(),
    },
    orgs: [] as Array<{
      category: OrganizationCategory;
      id: string;
      members: string[];
      ownerId: string;
    }>,
    referralPurchases: [] as WorldRow[],
    setupFaults: [] as Error[],
    userSessions: [] as string[],
  };

  const setupAccount = (
    userId: string,
    category: OrganizationCategory,
    organizationId = w.newId('org'),
  ) => {
    const existing = state.orgs.find((org) => org.ownerId === userId);
    const organization = existing ?? {
      category,
      id: organizationId,
      members: [userId],
      ownerId: userId,
    };
    if (!existing) state.orgs.push(organization);
    if (!state.brands.some((row) => row.organizationId === organization.id)) {
      state.brands.push({
        id: w.newId('brand'),
        isDeleted: false,
        organizationId: organization.id,
      });
    }
    if (!w.settings.some((row) => row.organizationId === organization.id)) {
      w.settings.push({
        id: w.newId('settings'),
        organizationId: organization.id,
      });
    }
    return organization;
  };
  const fail = (queue: Array<Error | false>) => {
    const fault = queue.shift();
    if (fault instanceof Error) throw fault;
    return fault !== false;
  };

  const handler = new StripeCheckoutWebhookHandler(
    w.collaborators.logger,
    {
      createWithKey: async (data: WorldRow) => {
        const id = w.newId('key');
        state.apiKeys.push({ id, isRevoked: false, ...data });
        return { plainKey: `gf_${id}` };
      },
      findOne: async (where: WorldRow) =>
        state.apiKeys.find((row) =>
          Object.entries(where).every(([field, value]) => row[field] === value),
        ) ?? null,
      patch: async (id: string, data: WorldRow) => {
        Object.assign(state.apiKeys.find((row) => row.id === id) ?? {}, data);
      },
    } as unknown as ApiKeysService,
    {
      findOne: async (where: { isDeleted: boolean; organizationId: string }) =>
        state.brands.find(
          (row) =>
            row.organizationId === where.organizationId &&
            row.isDeleted === where.isDeleted,
        ) ?? null,
    } as unknown as BrandsService,
    w.collaborators.subscriptions,
    w.collaborators.creditsUtils,
    {
      upsertForOrganization: async (
        organizationId: string,
        customerId: string,
      ) => {
        state.customers.set(organizationId, customerId);
      },
    } as unknown as CustomersService,
    w.collaborators.users,
    {
      cacheCheckoutResult: async (sessionId: string, result: unknown) => {
        const isCached = fail(state.managed.faults.cache);
        if (isCached) state.managed.results.set(sessionId, result);
        return isCached;
      },
      getCheckoutResult: async (sessionId: string) =>
        state.managed.results.get(sessionId) ?? null,
      isSessionProvisioned: async (sessionId: string) =>
        state.managed.provisioned.has(sessionId),
      logProvisioningContention: (sessionId: string) => {
        w.journal.push(`contention ${sessionId}`);
      },
      markSessionProvisioned: async (sessionId: string) => {
        const isMarked = fail(state.managed.faults.mark);
        if (isMarked) state.managed.provisioned.add(sessionId);
        return isMarked;
      },
      withProvisioningLock: async <T>(
        _sessionId: string,
        run: () => Promise<T>,
      ) => (state.managed.isLocked ? null : await run()),
    } as unknown as ManagedStripeCheckoutService,
    {
      findOne: async (where: { userId: string }) => {
        const org = state.orgs.find((row) => row.ownerId === where.userId);
        return org ? { id: org.id } : null;
      },
      findOneSelect: async (where: {
        category?: OrganizationCategory;
        members: { some: { userId: string } };
      }) => {
        const org = state.orgs.find(
          (row) =>
            row.members.includes(where.members.some.userId) &&
            (where.category === undefined || row.category === where.category),
        );
        return org ? { id: org.id } : null;
      },
    } as unknown as OrganizationsService,
    {
      updateFromStripeSession: async (
        userId: string,
        session: StripeCheckoutSession,
      ) => {
        state.userSessions.push(`${userId}:${session.id}`);
      },
    } as unknown as IUserSubscriptionsService,
    w.collaborators.organizationSettings,
    w.collaborators.prisma,
    w.collaborators.accessBootstrap,
    {
      initializeUserResources: async (
        userId: string,
        category: OrganizationCategory,
      ) => {
        const fault = state.setupFaults.shift();
        if (fault) throw fault;
        w.journal.push(`setup ${userId}`);
        const organization = setupAccount(userId, category);
        const presetScopes = state.keyOnSetup.shift();
        if (presetScopes) {
          state.apiKeys.push({
            category: ApiKeyCategory.GENFEEDAI,
            id: 'key_preset',
            isRevoked: false,
            label: MANAGED_API_KEY_LABEL,
            organizationId: organization.id,
            scopes: presetScopes,
            userId,
          });
        }
        return {
          brand: state.brands.find(
            (row) => row.organizationId === organization.id,
          ),
          organization: { id: organization.id },
        };
      },
    } as unknown as UserSetupService,
    {
      emitAsync: async (event: string, payload: WorldRow) => {
        state.events.push({ event, payload });
        return [];
      },
    } as unknown as EventEmitter2,
    w.support,
    {
      trackSubscriptionAttributionFromSession: async (
        session: StripeCheckoutSession,
        subscription: WorldRow,
      ) => {
        state.attributions.push({
          organizationId: subscription.organizationId,
          sessionId: session.id,
        });
      },
    } as unknown as StripeAttributionTrackerService,
    {
      recordCheckoutCompleted: async (sessionId: string) => {
        state.checkoutsSeen.push(sessionId);
      },
    } as unknown as LifecycleEmailService,
    {
      deliverEmail: async (input: WorldRow) => {
        // Delivery is idempotent per key, like the notifications outbox.
        if (
          !state.emails.some(
            (row) => row.idempotencyKey === input.idempotencyKey,
          )
        ) {
          state.emails.push(input);
        }
      },
    } as unknown as NotificationsService,
    {
      recordPaygPurchase: async (input: WorldRow) => {
        state.referralPurchases.push(input);
      },
    } as unknown as ReferralsService,
  );

  return Object.assign(w, state, { handler, setupAccount });
}
type World = ReturnType<typeof world>;

const logged = (w: World, level: string) =>
  w.logs.filter((entry) => entry.level === level).map((entry) => entry.message);
const activities = (w: World) =>
  w.journal
    .filter((entry) => entry.startsWith('activity '))
    .map((entry) => JSON.parse(entry.slice('activity '.length)));

describe('StripeCheckoutWebhookHandler', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: STRIPE_WORLD_NOW, toFake: ['Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('dispatch', () => {
    it('records every completed checkout and ignores an unsupported session type', async () => {
      const w = world();

      await w.handler.handleCheckoutCompleted(
        checkout({
          id: 'cs_unknown',
          metadata: { type: 'mystery' },
          mode: 'payment',
        }),
        'test',
      );

      expect(w.checkoutsSeen).toEqual(['cs_unknown']);
      expect(w.ledger).toEqual([]);
      expect(w.revenue).toEqual([]);
      expect(w.logs).toEqual([
        {
          level: 'warn',
          message: 'test ignoring unsupported checkout session type',
          meta: { sessionId: 'cs_unknown', type: 'mystery' },
        },
      ]);
    });

    it('attributes a subscription checkout and completes the subscriber onboarding, leaving grants to the invoice', async () => {
      const w = world();
      w.subscriptions.push({
        organizationId: 'org_1',
        stripeCustomerId: 'cus_1',
        userId: 'user_1',
      });
      w.users.push({
        id: 'user_1',
        isDeleted: false,
        isOnboardingCompleted: false,
      });

      await w.handler.handleCheckoutCompleted(
        checkout({ customer: 'cus_1', id: 'cs_sub_1', mode: 'subscription' }),
        'test',
      );

      expect(w.attributions).toEqual([
        { organizationId: 'org_1', sessionId: 'cs_sub_1' },
      ]);
      expect(w.users[0]).toMatchObject({ isOnboardingCompleted: true });
      expect(w.ledger).toEqual([]);
      expect(w.revenue).toEqual([]);
    });
  });

  describe('payment mode (PAYG)', () => {
    const PAYG = {
      amount_total: 5900,
      customer: 'cus_1',
      id: 'cs_payg_1',
      metadata: { credits: '500', userId: 'user_1' },
      mode: 'payment',
      payment_intent: 'pi_1',
      total_details: { amount_discount: 0, amount_tax: 900 },
    };
    function subscribed(): World {
      const w = world();
      w.subscriptions.push({
        organizationId: 'org_1',
        stripeCustomerId: 'cus_1',
        userId: 'user_1',
      });
      w.users.push({
        id: 'user_1',
        isDeleted: false,
        isOnboardingCompleted: false,
      });
      w.fees.set('pi_1', { currency: 'usd', feeMinor: 201 });
      return w;
    }

    it('grants the pack once, books revenue and its fee, and credits the referrer across replays', async () => {
      const w = subscribed();

      await w.handler.handleCheckoutCompleted(checkout(PAYG), 'test');
      await w.handler.handleCheckoutCompleted(checkout(PAYG), 'test');

      expect(w.ledger).toEqual([
        expect.objectContaining({
          actorUserId: 'user_1',
          amount: 500,
          description: 'Credit pack purchase (500 credits)',
          organizationId: 'org_1',
          referenceId: 'cs_payg_1',
          referenceType: 'stripe-checkout-session:organization-payment',
          source: ActivitySource.PAY_AS_YOU_GO,
        }),
      ]);
      expect(activities(w)).toEqual([
        {
          key: 'credits-add',
          organizationId: 'org_1',
          source: ActivitySource.PAY_AS_YOU_GO,
          userId: 'user_1',
          value: '500',
        },
      ]);
      expect(w.users[0]).toMatchObject({ isOnboardingCompleted: true });
      expect(w.revenue).toEqual([
        expect.objectContaining({
          amountMinor: 5000,
          occurredAt: CREATED_AT,
          organizationId: 'org_1',
          source: BillingRevenueSource.CREDIT_PURCHASE,
          stripeObjectId: 'cs_payg_1',
          userId: 'user_1',
        }),
        expect.objectContaining({
          amountMinor: -201,
          source: BillingRevenueSource.PROCESSING_FEE,
          stripeObjectId: 'fee:cs_payg_1',
        }),
      ]);
      expect(w.referralPurchases[0]).toEqual({
        grossAmountCents: 5900,
        netAmountCents: 5000,
        organizationId: 'org_1',
        purchasedCredits: 500,
        stripeCheckoutSessionId: 'cs_payg_1',
        stripePaymentIntentId: 'pi_1',
      });
      expect(logged(w, 'log')).toContain(
        'test PAYG checkout already processed',
      );
    });

    it.each([
      ['a stated total', { amount_total: 5900 }, 5900, 5000],
      [
        'a subtotal less its discount plus tax',
        {
          amount_subtotal: 5000,
          amount_total: null,
          total_details: { amount_discount: 1000, amount_tax: 800 },
        },
        4800,
        4000,
      ],
      ['no amounts at all', { amount_total: null, total_details: null }, 0, 0],
    ])(
      'credits the referrer with gross and net amounts from %s',
      async (_name, amounts, gross, net) => {
        const w = subscribed();

        await w.handler.handleCheckoutCompleted(
          checkout({ ...PAYG, ...amounts }),
          'test',
        );

        expect(w.referralPurchases).toEqual([
          expect.objectContaining({
            grossAmountCents: gross,
            netAmountCents: net,
          }),
        ]);
      },
    );

    it('records the activity once when a retry after a lost Redis marker finds the grant', async () => {
      const w = subscribed();
      w.faults.marker.push(false);

      await w.handler.handleCheckoutCompleted(checkout(PAYG), 'test');
      await w.handler.handleCheckoutCompleted(checkout(PAYG), 'test');

      expect(w.ledger).toHaveLength(1);
      expect(activities(w)).toHaveLength(1);
      expect(logged(w, 'log')).toContain(
        'test PAYG checkout credit grant already exists',
      );
    });

    it('records an organization activity without a user when the subscriber is gone', async () => {
      const w = subscribed();
      w.users.splice(0, 1, { id: 'user_1', isDeleted: true });

      await w.handler.handleCheckoutCompleted(checkout(PAYG), 'test');

      expect(activities(w)).toEqual([
        {
          key: 'credits-add',
          organizationId: 'org_1',
          source: ActivitySource.PAY_AS_YOU_GO,
          value: '500',
        },
      ]);
      expect(logged(w, 'warn')).toEqual([
        'test could not find user for onboarding completion',
      ]);
    });

    it('books nothing when no subscription matches the customer', async () => {
      const w = world();

      await w.handler.handleCheckoutCompleted(checkout(PAYG), 'test');

      expect(w.ledger).toEqual([]);
      expect(w.revenue).toEqual([]);
      expect(w.referralPurchases).toEqual([]);
      expect(logged(w, 'warn')).toEqual([
        'test subscription not found for payment',
      ]);
    });

    it('logs and rethrows a failed grant so Stripe retries, leaving the session unmarked', async () => {
      const w = subscribed();
      w.faults.grant.push(new Error('ledger down'));

      await expect(
        w.handler.handleCheckoutCompleted(checkout(PAYG), 'test'),
      ).rejects.toThrow('ledger down');

      expect(w.markers.size).toBe(0);
      expect(w.revenue).toEqual([]);
      expect(logged(w, 'error')).toEqual([
        'test failed to handle checkout completed',
      ]);
    });
  });

  describe('managed inference', () => {
    const EMAIL = 'ada@example.com';
    const MANAGED = {
      amount_total: 2000,
      customer: 'cus_managed_1',
      customer_details: { email: EMAIL },
      id: 'cs_managed_1',
      metadata: {
        credits: '100',
        firstName: 'Ada',
        lastName: 'Lovelace',
        type: 'managed_inference',
      },
      mode: 'payment',
    };
    function returningBuyer(): World {
      const w = world();
      w.users.push({
        email: EMAIL,
        id: 'user_existing',
        isDeleted: false,
        isOnboardingCompleted: true,
        onboardingCompletedAt: new Date('2026-01-01T00:00:00.000Z'),
        onboardingStepsCompleted: ['brand'],
      });
      w.setupAccount(
        'user_existing',
        OrganizationCategory.BUSINESS,
        'org_existing',
      );
      return w;
    }

    it('provisions a net-new buyer: account, credits, revenue, managed key, org customer and cached result', async () => {
      const w = world();

      await w.handler.handleCheckoutCompleted(checkout(MANAGED), 'test');

      const user = w.users[0];
      const org = w.orgs[0];
      expect(user).toMatchObject({
        email: EMAIL,
        firstName: 'Ada',
        isOnboardingCompleted: true,
        lastName: 'Lovelace',
        onboardingCompletedAt: STRIPE_WORLD_NOW,
        onboardingStepsCompleted: ['brand', 'providers', 'summary'],
      });
      expect(user).not.toHaveProperty('stripeCustomerId');
      expect(w.events).toEqual([
        {
          event: BETTER_AUTH_USER_CREATED_EVENT,
          payload: { email: EMAIL, name: 'Ada Lovelace', userId: user?.id },
        },
      ]);
      expect(org).toMatchObject({
        category: OrganizationCategory.BUSINESS,
        ownerId: user?.id,
      });
      expect(w.ledger).toEqual([
        expect.objectContaining({
          actorUserId: user?.id,
          amount: 100,
          description: 'Managed credit pack purchase (100 credits)',
          organizationId: org?.id,
          referenceType: 'stripe-checkout-session:managed-inference',
          source: 'managed-inference',
        }),
      ]);
      expect(w.revenue).toEqual([
        expect.objectContaining({
          amountMinor: 2000,
          stripeObjectId: 'cs_managed_1',
        }),
      ]);
      expect(w.apiKeys).toEqual([
        expect.objectContaining({
          category: ApiKeyCategory.GENFEEDAI,
          label: MANAGED_API_KEY_LABEL,
          metadata: {
            source: 'managed_inference',
            stripeSessionId: 'cs_managed_1',
          },
          organizationId: org?.id,
          rateLimit: 100,
          scopes: MANAGED_API_KEY_SCOPES,
          userId: user?.id,
        }),
      ]);
      expect([...w.customers.entries()]).toEqual([[org?.id, 'cus_managed_1']]);
      expect(w.settings[0]).toMatchObject({ hasEverHadCredits: true });
      expect(w.managed.results.get('cs_managed_1')).toEqual({
        apiKey: `gf_${w.apiKeys[0]?.id}`,
        apiKeyAlreadyExists: false,
        brandId: w.brands[0]?.id,
        email: EMAIL,
        organizationId: org?.id,
        userId: user?.id,
      });
      expect(w.managed.provisioned).toEqual(new Set(['cs_managed_1']));
      expect(activities(w)).toEqual([
        expect.objectContaining({ brandId: w.brands[0]?.id, value: '100' }),
      ]);
      expect(w.journal).toEqual(
        expect.arrayContaining([
          `invalidate request-context org ${org?.id}`,
          `invalidate access-bootstrap user ${user?.id}`,
        ]),
      );
    });

    it('tops up a returning buyer without a new account or key, keeping their onboarding history', async () => {
      const w = returningBuyer();

      await w.handler.handleCheckoutCompleted(checkout(MANAGED), 'test');

      expect(w.users).toHaveLength(1);
      expect(w.users[0]).toMatchObject({
        onboardingCompletedAt: new Date('2026-01-01T00:00:00.000Z'),
        onboardingStepsCompleted: ['brand'],
      });
      expect(w.events).toEqual([]);
      expect(w.apiKeys).toEqual([]);
      expect(w.ledger).toEqual([
        expect.objectContaining({
          amount: 100,
          organizationId: 'org_existing',
        }),
      ]);
      expect(w.managed.results.get('cs_managed_1')).toMatchObject({
        apiKey: null,
        apiKeyAlreadyExists: true,
        organizationId: 'org_existing',
      });
    });

    it.each([
      [
        'adds the missing managed scopes to',
        [ApiKeyScope.POSTS_READ, ApiKeyScope.VIDEOS_READ],
        [ApiKeyScope.POSTS_READ, ...MANAGED_API_KEY_SCOPES],
      ],
      [
        'leaves the full scope set on',
        [...MANAGED_API_KEY_SCOPES],
        [...MANAGED_API_KEY_SCOPES],
      ],
    ])(
      '%s the managed key a new account already holds, returning no plain key',
      async (_name, held, expected) => {
        const w = world();
        w.keyOnSetup.push(held);

        await w.handler.handleCheckoutCompleted(checkout(MANAGED), 'test');

        expect(w.apiKeys).toEqual([
          expect.objectContaining({ id: 'key_preset', scopes: expected }),
        ]);
        expect(w.managed.results.get('cs_managed_1')).toMatchObject({
          apiKey: null,
          apiKeyAlreadyExists: true,
        });
      },
    );

    it('returns the cached result of an already provisioned session without granting again', async () => {
      const w = returningBuyer();
      w.managed.provisioned.add('cs_managed_1');
      w.managed.results.set('cs_managed_1', {
        organizationId: 'org_existing',
        userId: 'user_existing',
      });

      await w.handler.handleCheckoutCompleted(checkout(MANAGED), 'test');

      expect(w.ledger).toEqual([]);
      expect(logged(w, 'log')).toEqual(['test managed checkout provisioned']);
    });

    it('stands aside while another delivery holds the provisioning lock', async () => {
      const w = returningBuyer();
      w.managed.isLocked = true;

      await w.handler.handleCheckoutCompleted(checkout(MANAGED), 'test');

      expect(w.ledger).toEqual([]);
      expect(w.journal).toEqual(['contention cs_managed_1']);
    });

    it('provisions nothing for a session without an email', async () => {
      const w = world();

      await w.handler.handleCheckoutCompleted(
        checkout({ ...MANAGED, customer_details: {} }),
        'test',
      );

      expect(w.users).toEqual([]);
      expect(w.ledger).toEqual([]);
      expect(logged(w, 'warn')).toEqual([
        'test managed checkout missing email in session',
      ]);
    });

    it('refuses a pack with negative credits before granting, leaving the session unprovisioned', async () => {
      const w = returningBuyer();

      await expect(
        w.handler.handleCheckoutCompleted(
          checkout({
            ...MANAGED,
            metadata: { ...MANAGED.metadata, credits: '-5' },
          }),
          'test',
        ),
      ).rejects.toThrow(
        'Managed checkout credits missing or invalid for session cs_managed_1',
      );

      expect(w.ledger).toEqual([]);
      expect(w.managed.provisioned.size).toBe(0);
    });

    it.each<[string, Error | false]>([
      ['report failure', false],
      ['throw', new Error('redis down')],
    ])(
      'completes provisioning when the post-grant Redis writes %s',
      async (_name, fault) => {
        const w = returningBuyer();
        w.managed.faults.cache.push(fault);
        w.managed.faults.mark.push(fault);

        await expect(
          w.handler.handleCheckoutCompleted(checkout(MANAGED), 'test'),
        ).resolves.toBeUndefined();

        expect(w.ledger).toHaveLength(1);
        expect(logged(w, 'warn')).toEqual([
          'test failed to cache managed checkout result',
          'test failed to mark managed checkout session as provisioned',
        ]);
      },
    );

    it('records the activity once when a retry after lost Redis markers finds the grant', async () => {
      const w = world();
      w.managed.faults.mark.push(false);

      await w.handler.handleCheckoutCompleted(checkout(MANAGED), 'test');
      await w.handler.handleCheckoutCompleted(checkout(MANAGED), 'test');

      expect(w.users).toHaveLength(1);
      expect(w.ledger).toHaveLength(1);
      expect(w.apiKeys).toHaveLength(1);
      expect(activities(w)).toHaveLength(1);
      expect(logged(w, 'log')).toContain(
        'test managed checkout credit grant already exists',
      );
    });

    it('reuses the account a concurrent delivery created for the same email', async () => {
      const w = world();
      w.races.beforeUserCreate = () => {
        w.users.push({ email: EMAIL, id: 'user_racer', isDeleted: false });
        w.setupAccount(
          'user_racer',
          OrganizationCategory.BUSINESS,
          'org_racer',
        );
      };

      await w.handler.handleCheckoutCompleted(checkout(MANAGED), 'test');

      expect(w.users.map((row) => row.id)).toEqual(['user_racer']);
      expect(w.events).toEqual([]);
      expect(w.apiKeys).toEqual([]);
      expect(w.ledger).toEqual([
        expect.objectContaining({
          actorUserId: 'user_racer',
          organizationId: 'org_racer',
        }),
      ]);
    });

    it('never revives a soft-deleted account that holds the email', async () => {
      const w = world();
      w.users.push({ email: EMAIL, id: 'user_deleted', isDeleted: true });

      await expect(
        w.handler.handleCheckoutCompleted(checkout(MANAGED), 'test'),
      ).rejects.toMatchObject({ code: 'P2002' });

      expect(w.users).toEqual([
        { email: EMAIL, id: 'user_deleted', isDeleted: true },
      ]);
      expect(w.ledger).toEqual([]);
    });
  });

  describe('user credits', () => {
    const USER_CHECKOUT = {
      amount_total: 1500,
      customer: 'cus_user',
      id: 'cs_user_1',
      metadata: { credits: '300', type: 'user', userId: 'user_1' },
      mode: 'payment',
    };
    function member(category: OrganizationCategory): World {
      const w = world();
      w.users.push({ id: 'user_1', isDeleted: false });
      w.orgs.push(
        {
          category: OrganizationCategory.BUSINESS,
          id: 'org_team',
          members: ['user_9', 'user_1'],
          ownerId: 'user_9',
        },
        { category, id: 'org_own', members: ['user_1'], ownerId: 'user_1' },
      );
      return w;
    }

    it('grants the pack once to the buyer creator organization and records the purchase across replays', async () => {
      const w = member(OrganizationCategory.CREATOR);

      await w.handler.handleCheckoutCompleted(checkout(USER_CHECKOUT), 'test');
      await w.handler.handleCheckoutCompleted(checkout(USER_CHECKOUT), 'test');

      expect(w.ledger).toEqual([
        expect.objectContaining({
          actorUserId: 'user_1',
          amount: 300,
          description: 'Credit pack purchase (300 credits) via Stripe',
          organizationId: 'org_own',
          referenceType: 'stripe-checkout-session:user-credit',
          source: 'user-purchase',
        }),
      ]);
      expect(w.userSessions).toEqual(['user_1:cs_user_1']);
      expect(activities(w)).toEqual([
        {
          key: 'credits-add',
          organizationId: 'org_own',
          source: ActivitySource.PAY_AS_YOU_GO,
          userId: 'user_1',
          value: '300',
        },
      ]);
      expect(w.revenue).toEqual([
        expect.objectContaining({
          amountMinor: 1500,
          organizationId: 'org_own',
        }),
      ]);
    });

    it('falls back to the first organization the buyer belongs to without a creator organization', async () => {
      const w = member(OrganizationCategory.BUSINESS);

      await w.handler.handleCheckoutCompleted(checkout(USER_CHECKOUT), 'test');

      expect(w.ledger).toEqual([
        expect.objectContaining({ organizationId: 'org_team' }),
      ]);
      expect(logged(w, 'warn')).toEqual([
        'test creator org not found for user, falling back to first org',
      ]);
    });

    it.each<[string, (w: World) => void, WorldRow, string, string]>([
      [
        'no user id',
        () => undefined,
        { metadata: { type: 'user' } },
        'warn',
        'test user ID not found in session metadata',
      ],
      [
        'an unknown user',
        () => undefined,
        {},
        'warn',
        'test user not found for user checkout',
      ],
      [
        'a user without an organization',
        (w) => w.users.push({ id: 'user_1', isDeleted: false }),
        {},
        'error',
        'test no organization found for user',
      ],
    ])(
      'grants nothing for %s',
      async (_name, arrange, fields, level, message) => {
        const w = world();
        arrange(w);

        await w.handler.handleCheckoutCompleted(
          checkout({ ...USER_CHECKOUT, ...fields }),
          'test',
        );

        expect(w.ledger).toEqual([]);
        expect(logged(w, level)).toEqual([message]);
      },
    );
  });

  describe('skills-pro', () => {
    const SKILLS = {
      amount_total: 4900,
      customer: 'cus_skills',
      customer_details: { email: ' Buyer@Example.com ' },
      id: 'cs_skills_1',
      metadata: { type: 'skills-pro' },
      payment_intent: 'pi_1',
    };
    const receiptIdOf = (w: World) => String(w.receipts[0]?.receiptId);

    it('records the receipt, emails the install command and provisions the buyer by lower-case email', async () => {
      const w = world();

      await w.handler.handleCheckoutCompleted(checkout(SKILLS), 'test');

      const receiptId = receiptIdOf(w);
      const buyer = w.users[0];
      expect(receiptId).toMatch(/^sk_rcpt_/);
      expect(buyer).toMatchObject({ email: 'buyer@example.com' });
      expect(w.receipts).toEqual([
        {
          data: {
            amountPaid: 4900,
            currency: 'usd',
            email: 'buyer@example.com',
            productType: 'bundle',
            provisioningStatus: 'completed',
            receiptId,
            skills: [],
            status: 'completed',
            stripeCustomerId: 'cus_skills',
            stripePaymentIntentId: 'pi_1',
            stripeSessionId: 'cs_skills_1',
            userId: buyer?.id,
          },
          id: 'receipt_1',
          isDeleted: false,
          productType: 'bundle',
          receiptId,
          skillSlugs: [],
          status: 'completed',
        },
      ]);
      expect(w.emails).toEqual([
        expect.objectContaining({
          idempotencyKey: 'skills-pro/receipt/cs_skills_1',
          subject: 'Your Skills Pro receipt',
          text: expect.stringContaining(
            `npx @genfeedai/skills-pro install ${receiptId}`,
          ),
          to: 'buyer@example.com',
        }),
      ]);
      expect(w.journal).toContain(`setup ${buyer?.id}`);
      expect(JSON.stringify(w.logs)).not.toContain('buyer@example.com');
    });

    it('links the receipt to the existing lower-case account', async () => {
      const w = world();
      w.users.push({
        email: 'buyer@example.com',
        id: 'user_buyer',
        isDeleted: false,
      });

      await w.handler.handleCheckoutCompleted(checkout(SKILLS), 'test');

      expect(w.users).toHaveLength(1);
      expect(w.receipts[0]?.data).toMatchObject({ userId: 'user_buyer' });
    });

    it.each([
      [
        'a single skill',
        { productType: 'skill', skillSlug: 'seo-audit' },
        'skill',
        ['seo-audit'],
      ],
      [
        'a deduplicated slug list',
        { skillSlugs: 'seo-audit, hooks ,seo-audit,' },
        'bundle',
        ['seo-audit', 'hooks'],
      ],
    ])(
      'persists the exact grant for %s',
      async (_name, metadata, productType, slugs) => {
        const w = world();

        await w.handler.handleCheckoutCompleted(
          checkout({
            ...SKILLS,
            metadata: { type: 'skills-pro', ...metadata },
          }),
          'test',
        );

        expect(w.receipts[0]).toMatchObject({ productType, skillSlugs: slugs });
      },
    );

    it('keeps a pending receipt when provisioning fails, and the retry provisions it once with one email', async () => {
      const w = world();
      w.setupFaults.push(new Error('setup failed'));

      await expect(
        w.handler.handleCheckoutCompleted(checkout(SKILLS), 'test'),
      ).rejects.toThrow('setup failed');
      expect(w.receipts[0]?.data).toMatchObject({
        provisioningStatus: 'pending',
      });
      expect(w.emails).toHaveLength(1);

      await w.handler.handleCheckoutCompleted(checkout(SKILLS), 'test');

      expect(w.receipts).toHaveLength(1);
      expect(w.receipts[0]?.data).toMatchObject({
        provisioningStatus: 'completed',
        userId: w.users[0]?.id,
      });
      expect(w.users).toHaveLength(1);
      expect(w.emails).toHaveLength(1);
      expect(logged(w, 'error')).toEqual([
        'test failed to handle skills-pro checkout completed',
        'test failed to handle checkout completed',
      ]);
    });

    it('creates no receipt for a session without a buyer email', async () => {
      const w = world();

      await expect(
        w.handler.handleCheckoutCompleted(
          checkout({ ...SKILLS, customer_details: {} }),
          'test',
        ),
      ).rejects.toThrow(
        'skills-pro checkout cs_skills_1 is missing a customer email',
      );

      expect(w.receipts).toEqual([]);
      expect(w.emails).toEqual([]);
    });

    it.each<[string, (w: World) => void]>([
      [
        'the session is marked processed',
        (w) =>
          w.markers.set(
            'stripe-checkout-session:skills-pro-receipt:processed:cs_skills_1',
            { options: {}, value: {} },
          ),
      ],
      [
        'a lost marker leaves the receipt behind',
        (w) => w.faults.marker.push(false),
      ],
    ])(
      'keeps one receipt when %s and Stripe replays',
      async (_name, arrange) => {
        const w = world();
        await w.handler.handleCheckoutCompleted(checkout(SKILLS), 'test');
        arrange(w);

        await w.handler.handleCheckoutCompleted(checkout(SKILLS), 'test');

        expect(w.receipts).toHaveLength(1);
        expect(w.emails).toHaveLength(1);
      },
    );

    it('refuses a persisted receipt that carries no receipt id', async () => {
      const w = world();
      w.receipts.push({
        data: { stripeSessionId: 'cs_skills_1' },
        id: 'receipt_broken',
        isDeleted: false,
        receiptId: null,
      });

      await expect(
        w.handler.handleCheckoutCompleted(checkout(SKILLS), 'test'),
      ).rejects.toThrow(
        'skills-pro checkout cs_skills_1 has a receipt without an id',
      );

      expect(w.receipts).toHaveLength(1);
      expect(w.emails).toEqual([]);
    });
  });
});
