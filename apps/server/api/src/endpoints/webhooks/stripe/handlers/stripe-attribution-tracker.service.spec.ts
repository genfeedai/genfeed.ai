import type { UsersService } from '@api/collections/users/services/users.service';
import { StripeAttributionTrackerService } from '@api/endpoints/webhooks/stripe/handlers/stripe-attribution-tracker.service';
import type {
  StripeCheckoutSession,
  StripeService,
} from '@api/services/integrations/stripe/services/stripe.service';
import type {
  ISubscriptionAttributionsService,
  ISubscriptionOssReadModel,
} from '@genfeedai/contracts/interfaces/billing';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it } from 'vitest';

describe('StripeAttributionTrackerService', () => {
  const subscription = {
    cancelAtPeriodEnd: false,
    id: 'sub_db_1',
    isDeleted: false,
    organizationId: 'org_1',
    status: 'active',
    stripePriceId: 'price_db',
    userId: 'user_1',
  } satisfies ISubscriptionOssReadModel;

  let stripeSubscriptions: Map<string, Record<string, unknown>>;
  let users: Map<string, { email: string }>;
  let attributions: Array<{
    input: Record<string, unknown>;
    organizationId: string;
  }>;
  let errors: string[];
  let tracker: StripeAttributionTrackerService;

  beforeEach(() => {
    stripeSubscriptions = new Map([
      [
        'sub_stripe_1',
        {
          customer: 'cus_123',
          items: {
            data: [
              { price: { currency: 'usd', id: 'price_1', unit_amount: 4900 } },
            ],
          },
        },
      ],
    ]);
    users = new Map([['user_1', { email: 'account@example.com' }]]);
    attributions = [];
    errors = [];

    tracker = new StripeAttributionTrackerService(
      {
        error: (message: string) => {
          errors.push(message);
        },
        log: () => {},
        warn: () => {},
      } as unknown as LoggerService,
      {
        getSubscription: async (id: string) => {
          const found = stripeSubscriptions.get(id);
          if (!found) {
            throw new Error(`No such subscription: ${id}`);
          }
          return found;
        },
      } as unknown as StripeService,
      {
        findOneSelect: async (where: { id: string }) =>
          users.get(where.id) ?? null,
      } as unknown as UsersService,
      {
        trackSubscription: async (
          input: Record<string, unknown>,
          organizationId: string,
        ) => {
          attributions.push({ input, organizationId });
        },
      } as unknown as ISubscriptionAttributionsService,
    );
  });

  function session(overrides: Record<string, unknown>): StripeCheckoutSession {
    return {
      customer: 'cus_123',
      id: 'cs_1',
      metadata: {},
      subscription: 'sub_stripe_1',
      ...overrides,
    } as unknown as StripeCheckoutSession;
  }

  it('records attribution with amount, plan, and UTM metadata from the session', async () => {
    await tracker.trackSubscriptionAttributionFromSession(
      session({
        customer_details: { email: 'ada@example.com' },
        metadata: {
          sourcePlatform: 'youtube',
          utm_campaign: 'launch',
          utm_source: 'newsletter',
        },
      }),
      subscription,
      'test',
    );

    expect(attributions).toEqual([
      {
        input: expect.objectContaining({
          amount: 4900,
          currency: 'USD',
          email: 'ada@example.com',
          plan: 'price_1',
          sessionId: 'cs_1',
          sourcePlatform: 'youtube',
          stripeCustomerId: 'cus_123',
          stripeSubscriptionId: 'sub_stripe_1',
          userId: 'user_1',
          utm: { campaign: 'launch', source: 'newsletter' },
        }),
        organizationId: 'org_1',
      },
    ]);
  });

  it('falls back to the account email when checkout captured none', async () => {
    await tracker.trackSubscriptionAttributionFromSession(
      session({}),
      subscription,
      'test',
    );

    expect(attributions[0]?.input.email).toBe('account@example.com');
  });

  it('returns early when the session carries no subscription', async () => {
    await tracker.trackSubscriptionAttributionFromSession(
      session({ subscription: undefined }),
      subscription,
      'test',
    );

    expect(attributions).toEqual([]);
    expect(errors).toEqual([]);
  });

  it('logs and swallows tracking failures', async () => {
    stripeSubscriptions.clear();

    await expect(
      tracker.trackSubscriptionAttributionFromSession(
        session({}),
        subscription,
        'test',
      ),
    ).resolves.toBeUndefined();

    expect(attributions).toEqual([]);
    expect(errors).toEqual(['test failed to record subscription attribution']);
  });
});
