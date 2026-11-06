/**
 * #4824 regression: `customer.subscription.created` must reach the credit
 * ledger.
 *
 * The handler forwards `subscription.status` off the Stripe object, which is
 * lowercase, while the reconciler's eligible set holds uppercase domain enum
 * members. Comparing them directly made every created event skip as
 * `ineligible_status`, leaving `invoice.paid` as the only path that ever
 * granted. The reconciler spec missed it because it passed enum members
 * rather than the value the handler really sends.
 *
 * This composes the real handler with the real reconciler so the two halves of
 * that contract are exercised together: only the ledger and the identity
 * resolver are faked. A future case mismatch on either side fails here.
 */
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { SubscriptionCreditGrantService } from '@api/common/subscriptions/subscription-credit-grant.service';
import { StripeSubscriptionCreditReconcilerService } from '@api/endpoints/webhooks/stripe/handlers/stripe-subscription-credit-reconciler.service';
import { StripeSubscriptionWebhookHandler } from '@api/endpoints/webhooks/stripe/handlers/stripe-subscription-webhook.handler';
import { StripeWebhookSupportService } from '@api/endpoints/webhooks/stripe/handlers/stripe-webhook-support.service';
import { StripeWebhookBillingService } from '@api/endpoints/webhooks/stripe/stripe-webhook-billing.service';
import type { StripeSubscription } from '@api/services/integrations/stripe/services/stripe.service';
import { selectSoftwareSubscriptionItem } from '@api/services/integrations/stripe/services/stripe-software-item.util';
import { LifecycleEmailService } from '@api/services/lifecycle-emails/lifecycle-email.service';
import { SubscriptionPlan } from '@genfeedai/contracts';
import { SUBSCRIPTIONS_SERVICE } from '@genfeedai/contracts/interfaces/billing';
import { LoggerService } from '@libs/logger/logger.service';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it } from 'vitest';

describe('subscription.created credit grant (#4824)', () => {
  let handler: StripeSubscriptionWebhookHandler;
  // Credit ledger rows written for the organization.
  let grants: unknown[][];
  // Initial grants `invoice.paid` already recorded, by ledger reference id.
  let recordedGrants: Set<string>;
  // Billing identities the handler resolved.
  let resolutions: unknown[];
  let logs: Array<{ detail?: unknown; level: string; message: string }>;

  const dbSubscription = {
    cancelAtPeriodEnd: false,
    id: 'sub_db_1',
    isDeleted: false,
    organizationId: 'org_1',
    plan: SubscriptionPlan.MONTHLY,
    status: 'active',
    stripePriceId: 'price_1',
    stripeSubscriptionId: 'sub_stripe_1',
    userId: 'user_1',
  };
  const noop = () => undefined;
  const logAt =
    (level: string) =>
    (message: string, detail?: unknown): void => {
      logs.push({ detail, level, message });
    };
  const outcomes = () =>
    logs.map(
      ({ detail }) => (detail as { outcome?: string } | undefined)?.outcome,
    );

  /** Shaped as the Stripe SDK delivers it: `status` is lowercase. */
  function stripeSubscription(status: string): StripeSubscription {
    return {
      cancel_at_period_end: false,
      customer: 'cus_1',
      id: 'sub_stripe_1',
      items: {
        data: [
          {
            current_period_end: 1_750_000_000,
            current_period_start: 1_747_321_600,
            price: { id: 'price_1', recurring: { interval: 'month' } },
          },
        ],
      },
      status,
    } as unknown as StripeSubscription;
  }

  beforeEach(async () => {
    grants = [];
    recordedGrants = new Set();
    resolutions = [];
    logs = [];

    const module = await Test.createTestingModule({
      providers: [
        StripeSubscriptionWebhookHandler,
        StripeSubscriptionCreditReconcilerService,
        {
          provide: LoggerService,
          useValue: {
            error: logAt('error'),
            log: logAt('log'),
            warn: logAt('warn'),
          },
        },
        {
          provide: CreditsUtilsService,
          useValue: {
            addOrganizationCreditsWithExpiration: async (
              ...args: unknown[]
            ) => {
              grants.push(args);
            },
            getOrganizationCreditsBalance: async () => 5_900,
            resetOrganizationCredits: noop,
          },
        },
        {
          provide: StripeWebhookSupportService,
          useValue: {
            hasSubscriptionCreditGrant: async (
              _organizationId: string,
              lookup: { reference: { referenceId: string } },
            ) => recordedGrants.has(lookup.reference.referenceId),
            isUniqueConstraintError: () => false,
            notifyOperatorOfBillingEvent: noop,
            recordCreditsActivity: noop,
            resolveSubscriptionPlan: () => SubscriptionPlan.MONTHLY,
            resolveTierFromPriceId: () => null,
            setHasEverHadCredits: noop,
            softwareItem: selectSoftwareSubscriptionItem,
            updateOrganizationTierAndModels: noop,
          },
        },
        {
          provide: StripeWebhookBillingService,
          useValue: {
            persist: async () => dbSubscription,
            resolve: async (input: unknown) => {
              resolutions.push(input);
              return { billingAccountId: 'ba_1', subscription: dbSubscription };
            },
          },
        },
        {
          provide: SUBSCRIPTIONS_SERVICE,
          useValue: { syncSubscriptionState: noop },
        },
        {
          provide: SubscriptionCreditGrantService,
          useValue: {
            logUnresolvedGrant: noop,
            resolvePlanCredits: async () => 5_900,
          },
        },
        { provide: UsersService, useValue: { findOne: async () => null } },
        { provide: LifecycleEmailService, useValue: {} },
      ],
    }).compile();

    handler = module.get(StripeSubscriptionWebhookHandler);
  });

  it.each(['active', 'trialing'])(
    'grants the initial credits for a %j subscription',
    async (status) => {
      await handler.handleSubscriptionCreated(
        stripeSubscription(status),
        'test',
      );

      expect(grants).toEqual([
        [
          'org_1',
          5_900,
          SubscriptionPlan.MONTHLY,
          expect.any(String),
          expect.any(Date),
          expect.objectContaining({
            billingAccountId: 'ba_1',
            referenceId: 'stripe-subscription:sub_stripe_1',
            referenceType: 'stripe-subscription:initial-grant',
          }),
        ],
      ]);
      expect(outcomes()).not.toContain('ineligible_status');
      expect(logs.filter(({ level }) => level === 'error')).toEqual([]);
    },
  );

  it('does not grant twice when invoice.paid already recorded the initial grant', async () => {
    recordedGrants.add('stripe-subscription:sub_stripe_1');

    await handler.handleSubscriptionCreated(
      stripeSubscription('active'),
      'test',
    );

    expect(grants).toEqual([]);
    expect(logs).toContainEqual(
      expect.objectContaining({
        detail: expect.objectContaining({ outcome: 'existing_grant' }),
        message: expect.stringContaining('reconciliation skipped'),
      }),
    );
  });

  it('does not grant for a subscription that is not yet paid', async () => {
    await handler.handleSubscriptionCreated(
      stripeSubscription('incomplete'),
      'test',
    );

    expect(grants).toEqual([]);
    expect(logs).toContainEqual(
      expect.objectContaining({
        detail: expect.objectContaining({ outcome: 'ineligible_status' }),
        message: expect.stringContaining('reconciliation skipped'),
      }),
    );
  });

  it('does not resolve billing identity or grant credits for a service-only subscription', async () => {
    const service = stripeSubscription('active');
    service.metadata = { billing_scope: 'service' };

    await handler.handleSubscriptionCreated(service, 'test');

    expect(resolutions).toEqual([]);
    expect(grants).toEqual([]);
  });
});
