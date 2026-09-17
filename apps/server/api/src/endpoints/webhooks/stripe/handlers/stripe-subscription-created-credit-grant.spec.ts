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
 * resolver are mocked. A future case mismatch on either side fails here.
 */
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { SubscriptionCreditGrantService } from '@api/common/subscriptions/subscription-credit-grant.service';
import { StripeSubscriptionCreditReconcilerService } from '@api/endpoints/webhooks/stripe/handlers/stripe-subscription-credit-reconciler.service';
import { StripeSubscriptionWebhookHandler } from '@api/endpoints/webhooks/stripe/handlers/stripe-subscription-webhook.handler';
import { StripeWebhookSupportService } from '@api/endpoints/webhooks/stripe/handlers/stripe-webhook-support.service';
import { StripeWebhookBillingService } from '@api/endpoints/webhooks/stripe/stripe-webhook-billing.service';
import type { StripeSubscription } from '@api/services/integrations/stripe/services/stripe.service';
import { LifecycleEmailService } from '@api/services/lifecycle-emails/lifecycle-email.service';
import { SubscriptionPlan } from '@genfeedai/contracts';
import { SUBSCRIPTIONS_SERVICE } from '@genfeedai/contracts/interfaces/billing';
import { LoggerService } from '@libs/logger/logger.service';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('subscription.created credit grant (#4824)', () => {
  let handler: StripeSubscriptionWebhookHandler;

  const loggerService = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
  const creditsUtilsService = {
    addOrganizationCreditsWithExpiration: vi.fn(),
    getOrganizationCreditsBalance: vi.fn(async () => 5_900),
    resetOrganizationCredits: vi.fn(),
  };
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
  const supportService = {
    hasSubscriptionCreditGrant: vi.fn(async () => false),
    isUniqueConstraintError: () => false,
    recordCreditsActivity: vi.fn(),
    resolveSubscriptionPlan: vi.fn(() => SubscriptionPlan.MONTHLY),
    resolveTierFromPriceId: vi.fn(() => null),
    setHasEverHadCredits: vi.fn(),
    updateOrganizationTierAndModels: vi.fn(),
  };
  const billingService = {
    persist: vi.fn(async () => dbSubscription),
    resolve: vi.fn(async () => ({
      billingAccountId: 'ba_1',
      subscription: dbSubscription,
    })),
  };

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
    vi.clearAllMocks();
    supportService.hasSubscriptionCreditGrant.mockResolvedValue(false);
    supportService.resolveTierFromPriceId.mockReturnValue(null);
    billingService.resolve.mockResolvedValue({
      billingAccountId: 'ba_1',
      subscription: dbSubscription,
    });
    billingService.persist.mockResolvedValue(dbSubscription);

    const module = await Test.createTestingModule({
      providers: [
        StripeSubscriptionWebhookHandler,
        StripeSubscriptionCreditReconcilerService,
        { provide: LoggerService, useValue: loggerService },
        { provide: CreditsUtilsService, useValue: creditsUtilsService },
        { provide: StripeWebhookSupportService, useValue: supportService },
        { provide: StripeWebhookBillingService, useValue: billingService },
        {
          provide: SUBSCRIPTIONS_SERVICE,
          useValue: { syncSubscriptionState: vi.fn() },
        },
        {
          provide: SubscriptionCreditGrantService,
          useValue: {
            logUnresolvedGrant: vi.fn(),
            resolvePlanCredits: vi.fn(async () => 5_900),
          },
        },
        { provide: UsersService, useValue: { findOne: vi.fn() } },
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

      expect(
        creditsUtilsService.addOrganizationCreditsWithExpiration,
      ).toHaveBeenCalledExactlyOnceWith(
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
      );
      expect(loggerService.log).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ outcome: 'ineligible_status' }),
      );
      expect(loggerService.error).not.toHaveBeenCalled();
    },
  );

  it('does not grant twice when invoice.paid already recorded the initial grant', async () => {
    supportService.hasSubscriptionCreditGrant.mockResolvedValue(true);

    await handler.handleSubscriptionCreated(
      stripeSubscription('active'),
      'test',
    );

    expect(
      creditsUtilsService.addOrganizationCreditsWithExpiration,
    ).not.toHaveBeenCalled();
    expect(loggerService.log).toHaveBeenCalledWith(
      expect.stringContaining('reconciliation skipped'),
      expect.objectContaining({ outcome: 'existing_grant' }),
    );
  });

  it('does not grant for a subscription that is not yet paid', async () => {
    await handler.handleSubscriptionCreated(
      stripeSubscription('incomplete'),
      'test',
    );

    expect(
      creditsUtilsService.addOrganizationCreditsWithExpiration,
    ).not.toHaveBeenCalled();
    expect(loggerService.log).toHaveBeenCalledWith(
      expect.stringContaining('reconciliation skipped'),
      expect.objectContaining({ outcome: 'ineligible_status' }),
    );
  });
});
