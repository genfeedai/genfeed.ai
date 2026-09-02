import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import { SubscriptionCreditGrantService } from '@api/common/subscriptions/subscription-credit-grant.service';
import { StripeInvoiceWebhookHandler } from '@api/endpoints/webhooks/stripe/handlers/stripe-invoice-webhook.handler';
import { StripeSubscriptionCreditReconcilerService } from '@api/endpoints/webhooks/stripe/handlers/stripe-subscription-credit-reconciler.service';
import { StripeWebhookSupportService } from '@api/endpoints/webhooks/stripe/handlers/stripe-webhook-support.service';
import { OrganizationBillingAccountService } from '@api/services/integrations/stripe/services/organization-billing-account.service';
import {
  ByokBillingStatus,
  SubscriptionPlan,
  SubscriptionStatus,
} from '@genfeedai/enums';
import {
  type ISubscriptionOssReadModel,
  SUBSCRIPTIONS_SERVICE,
} from '@genfeedai/interfaces/billing';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import type Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('StripeInvoiceWebhookHandler', () => {
  let handler: StripeInvoiceWebhookHandler;

  const configService = { get: vi.fn().mockReturnValue(undefined) };
  const loggerService = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
  const subscriptionsService = {
    findByOrganizationId: vi.fn(),
    findOne: vi.fn(),
    patch: vi.fn(),
    syncSubscriptionState: vi.fn(),
  };
  const creditsUtilsService = {
    addOrganizationCreditsWithExpiration: vi.fn(),
    getOrganizationCreditsBalance: vi.fn().mockResolvedValue(35_000),
    resetOrganizationCredits: vi.fn(),
  };
  const usersService = { findOne: vi.fn(), patch: vi.fn() };
  const accessBootstrapCacheService = { invalidateForUser: vi.fn() };
  const supportService = {
    hasSubscriptionCreditGrant: vi.fn().mockResolvedValue(false),
    isUniqueConstraintError: vi.fn().mockReturnValue(false),
    markOnboardingComplete: vi.fn(),
    recordCreditsActivity: vi.fn(),
    resolveTierFromPriceId: vi.fn().mockReturnValue(null),
    setByokBillingStatus: vi.fn(),
    setHasEverHadCredits: vi.fn(),
  };
  const creditGrantService = {
    logUnresolvedGrant: vi.fn(),
    resolvePlanCredits: vi.fn().mockResolvedValue(5_900),
  };
  const billingAccountService = { resolveWebhookOrganization: vi.fn() };

  function stripeResponse<T extends object>(resource: T): Stripe.Response<T> {
    return {
      ...resource,
      lastResponse: {
        headers: {},
        requestId: 'req_test',
        statusCode: 200,
      },
    };
  }

  function invoiceWith(
    overrides: Record<string, unknown>,
  ): Stripe.Response<Stripe.Invoice> {
    const invoice = {
      billing_reason: 'subscription_cycle',
      id: 'in_123',
      metadata: {},
      object: 'invoice',
      ...overrides,
    } as Stripe.Invoice;

    return stripeResponse(invoice);
  }

  const monthlySubscription = {
    cancelAtPeriodEnd: false,
    id: 'sub_db_1',
    isDeleted: false,
    organizationId: 'org_1',
    plan: SubscriptionPlan.MONTHLY,
    status: 'active',
    stripeSubscriptionId: 'sub_stripe_1',
    userId: 'user_1',
  } satisfies ISubscriptionOssReadModel;

  beforeEach(async () => {
    vi.clearAllMocks();
    configService.get.mockReturnValue(undefined);
    creditsUtilsService.getOrganizationCreditsBalance.mockResolvedValue(35_000);
    subscriptionsService.findOne.mockResolvedValue(monthlySubscription);
    subscriptionsService.patch.mockResolvedValue(monthlySubscription);
    subscriptionsService.findByOrganizationId.mockResolvedValue(null);
    billingAccountService.resolveWebhookOrganization.mockResolvedValue('org_1');
    supportService.resolveTierFromPriceId.mockReturnValue(null);
    creditGrantService.resolvePlanCredits.mockResolvedValue(5_900);
    supportService.hasSubscriptionCreditGrant.mockResolvedValue(false);
    supportService.isUniqueConstraintError.mockReturnValue(false);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StripeInvoiceWebhookHandler,
        StripeSubscriptionCreditReconcilerService,
        { provide: ConfigService, useValue: configService },
        { provide: LoggerService, useValue: loggerService },
        { provide: SUBSCRIPTIONS_SERVICE, useValue: subscriptionsService },
        { provide: CreditsUtilsService, useValue: creditsUtilsService },
        { provide: UsersService, useValue: usersService },
        {
          provide: AccessBootstrapCacheService,
          useValue: accessBootstrapCacheService,
        },
        { provide: StripeWebhookSupportService, useValue: supportService },
        {
          provide: SubscriptionCreditGrantService,
          useValue: creditGrantService,
        },
        {
          provide: OrganizationBillingAccountService,
          useValue: billingAccountService,
        },
      ],
    }).compile();

    handler = module.get(StripeInvoiceWebhookHandler);
  });

  describe('handleInvoicePaid', () => {
    it('ignores forward-compatible non-subscription billing reasons', async () => {
      await handler.handleInvoicePaid(
        invoiceWith({ billing_reason: 'future_reason' }),
        'test',
      );

      expect(subscriptionsService.findOne).not.toHaveBeenCalled();
      expect(subscriptionsService.patch).not.toHaveBeenCalled();
      expect(
        creditsUtilsService.resetOrganizationCredits,
      ).not.toHaveBeenCalled();
    });

    it('allocates monthly credits on a subscription_cycle invoice', async () => {
      await handler.handleInvoicePaid(
        invoiceWith({
          parent: {
            subscription_details: { subscription: 'sub_stripe_1' },
          },
        }),
        'test',
      );

      expect(subscriptionsService.findOne).toHaveBeenCalledWith({
        stripeSubscriptionId: 'sub_stripe_1',
      });
      expect(
        creditsUtilsService.addOrganizationCreditsWithExpiration,
      ).toHaveBeenCalledWith(
        'org_1',
        5_900,
        'monthly',
        expect.stringContaining('monthly'),
        expect.any(Date),
        expect.objectContaining({
          referenceId: 'stripe-invoice:in_123',
          referenceType: 'stripe-invoice:subscription-grant',
        }),
      );
      expect(supportService.setHasEverHadCredits).toHaveBeenCalledWith(
        'org_1',
        'test',
      );
    });

    it('resets credits for yearly subscriptions', async () => {
      subscriptionsService.findOne.mockResolvedValue({
        ...monthlySubscription,
        plan: SubscriptionPlan.YEARLY,
      });
      subscriptionsService.patch.mockResolvedValue({
        ...monthlySubscription,
        plan: SubscriptionPlan.YEARLY,
      });
      creditGrantService.resolvePlanCredits.mockResolvedValue(70_800);

      await handler.handleInvoicePaid(
        invoiceWith({
          parent: {
            subscription_details: { subscription: 'sub_stripe_1' },
          },
        }),
        'test',
      );

      expect(creditsUtilsService.resetOrganizationCredits).toHaveBeenCalledWith(
        'org_1',
        70_800,
        'yearly',
        expect.stringContaining('yearly'),
        expect.objectContaining({
          referenceId: 'stripe-invoice:in_123',
          referenceType: 'stripe-invoice:subscription-grant',
        }),
      );
    });

    it('grants the verified Pro allocation for a monthly subscription', async () => {
      subscriptionsService.findOne.mockResolvedValue({
        ...monthlySubscription,
        stripePriceId: 'price_pro',
      });
      creditGrantService.resolvePlanCredits.mockResolvedValue(5_900);

      await handler.handleInvoicePaid(
        invoiceWith({
          parent: { subscription_details: { subscription: 'sub_stripe_1' } },
        }),
        'test',
      );

      expect(
        creditsUtilsService.addOrganizationCreditsWithExpiration,
      ).toHaveBeenCalledWith(
        'org_1',
        5_900,
        'monthly',
        expect.stringContaining('monthly'),
        expect.any(Date),
        expect.objectContaining({
          referenceId: 'stripe-invoice:in_123',
          referenceType: 'stripe-invoice:subscription-grant',
        }),
      );
    });

    it('grants the verified Scale allocation for a monthly subscription', async () => {
      subscriptionsService.findOne.mockResolvedValue({
        ...monthlySubscription,
        stripePriceId: 'price_scale',
      });
      creditGrantService.resolvePlanCredits.mockResolvedValue(60_000);

      await handler.handleInvoicePaid(
        invoiceWith({
          parent: { subscription_details: { subscription: 'sub_stripe_1' } },
        }),
        'test',
      );

      expect(
        creditsUtilsService.addOrganizationCreditsWithExpiration,
      ).toHaveBeenCalledWith(
        'org_1',
        60_000,
        'monthly',
        expect.stringContaining('monthly'),
        expect.any(Date),
        expect.objectContaining({
          referenceId: 'stripe-invoice:in_123',
          referenceType: 'stripe-invoice:subscription-grant',
        }),
      );
    });

    it('grants the verified yearly allocation for a yearly Pro subscription', async () => {
      subscriptionsService.findOne.mockResolvedValue({
        ...monthlySubscription,
        plan: SubscriptionPlan.YEARLY,
        stripePriceId: 'price_pro_yearly',
      });
      creditGrantService.resolvePlanCredits.mockResolvedValue(70_800);

      await handler.handleInvoicePaid(
        invoiceWith({
          parent: { subscription_details: { subscription: 'sub_stripe_1' } },
        }),
        'test',
      );

      expect(creditsUtilsService.resetOrganizationCredits).toHaveBeenCalledWith(
        'org_1',
        70_800,
        'yearly',
        expect.stringContaining('yearly'),
        expect.objectContaining({
          referenceId: 'stripe-invoice:in_123',
          referenceType: 'stripe-invoice:subscription-grant',
        }),
      );
    });

    it('does not query subscriptions when the invoice carries no subscription id', async () => {
      await handler.handleInvoicePaid(invoiceWith({}), 'test');

      expect(subscriptionsService.findOne).not.toHaveBeenCalled();
      expect(loggerService.warn).toHaveBeenCalled();
    });

    it('throws when the subscription and billing identity are unavailable', async () => {
      subscriptionsService.findOne.mockResolvedValue(null);

      await expect(
        handler.handleInvoicePaid(
          invoiceWith({
            parent: {
              subscription_details: { subscription: 'sub_missing' },
            },
          }),
          'test',
        ),
      ).rejects.toThrow('Invoice billing identity unavailable');
      expect(
        creditsUtilsService.addOrganizationCreditsWithExpiration,
      ).not.toHaveBeenCalled();
    });

    it('reconciles an out-of-order invoice through verified subscription metadata', async () => {
      subscriptionsService.findOne.mockResolvedValue(null);
      subscriptionsService.findByOrganizationId.mockResolvedValue({
        ...monthlySubscription,
        stripeSubscriptionId: null,
      });

      await handler.handleInvoicePaid(
        invoiceWith({
          customer: 'cus_123',
          parent: {
            subscription_details: {
              metadata: {
                billing_account_type: 'organization',
                billing_organization_id: 'org_1',
              },
              subscription: 'sub_new',
            },
          },
        }),
        'test',
      );

      expect(
        billingAccountService.resolveWebhookOrganization,
      ).toHaveBeenCalled();
      expect(subscriptionsService.patch).toHaveBeenCalledWith(
        'sub_db_1',
        expect.objectContaining({ stripeSubscriptionId: 'sub_new' }),
      );
    });

    it('marks onboarding complete on the first subscription invoice', async () => {
      usersService.findOne.mockResolvedValue({
        id: 'user_1',
        isOnboardingCompleted: false,
      });

      await handler.handleInvoicePaid(
        invoiceWith({
          billing_reason: 'subscription_create',
          parent: {
            subscription_details: { subscription: 'sub_stripe_1' },
          },
        }),
        'test',
      );

      expect(usersService.findOne).toHaveBeenCalledWith({
        id: 'user_1',
      });
      expect(supportService.markOnboardingComplete).toHaveBeenCalledWith({
        id: 'user_1',
        isOnboardingCompleted: false,
      });
      expect(
        accessBootstrapCacheService.invalidateForUser,
      ).toHaveBeenCalledWith('user_1');
      expect(
        creditsUtilsService.addOrganizationCreditsWithExpiration,
      ).toHaveBeenCalledWith(
        'org_1',
        5_900,
        'monthly',
        expect.stringContaining('monthly'),
        expect.any(Date),
        expect.objectContaining({
          referenceId: 'stripe-subscription:sub_stripe_1',
          referenceType: 'stripe-subscription:initial-grant',
        }),
      );
    });

    it('propagates credit reconciliation failures for Stripe retry', async () => {
      const ledgerError = new Error('ledger unavailable');
      creditsUtilsService.addOrganizationCreditsWithExpiration.mockRejectedValueOnce(
        ledgerError,
      );

      await expect(
        handler.handleInvoicePaid(
          invoiceWith({
            parent: {
              subscription_details: { subscription: 'sub_stripe_1' },
            },
          }),
          'test',
        ),
      ).rejects.toBe(ledgerError);

      expect(loggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('failed to handle invoice paid'),
        { category: 'reconciliation_failed' },
      );
    });

    it('#1398: skips a duplicate monthly grant when the invoice reference already exists', async () => {
      supportService.hasSubscriptionCreditGrant.mockResolvedValue(true);

      await handler.handleInvoicePaid(
        invoiceWith({
          parent: {
            subscription_details: { subscription: 'sub_stripe_1' },
          },
        }),
        'test',
      );

      expect(supportService.hasSubscriptionCreditGrant).toHaveBeenCalledWith(
        'org_1',
        {
          reference: {
            referenceId: 'stripe-invoice:in_123',
            referenceType: 'stripe-invoice:subscription-grant',
          },
        },
      );
      expect(
        creditsUtilsService.addOrganizationCreditsWithExpiration,
      ).not.toHaveBeenCalled();
      expect(
        creditsUtilsService.resetOrganizationCredits,
      ).not.toHaveBeenCalled();
      expect(supportService.recordCreditsActivity).not.toHaveBeenCalled();
    });

    it('#1398: skips a duplicate yearly grant when the invoice reference already exists', async () => {
      subscriptionsService.findOne.mockResolvedValue({
        ...monthlySubscription,
        plan: SubscriptionPlan.YEARLY,
      });
      creditGrantService.resolvePlanCredits.mockResolvedValue(70_800);
      supportService.hasSubscriptionCreditGrant.mockResolvedValue(true);

      await handler.handleInvoicePaid(
        invoiceWith({
          parent: {
            subscription_details: { subscription: 'sub_stripe_1' },
          },
        }),
        'test',
      );

      expect(
        creditsUtilsService.resetOrganizationCredits,
      ).not.toHaveBeenCalled();
      expect(
        creditsUtilsService.addOrganizationCreditsWithExpiration,
      ).not.toHaveBeenCalled();
    });

    it('#1398: treats a P2002 unique-constraint race on the monthly grant as a no-op, not an error', async () => {
      const uniqueConstraintError = { code: 'P2002' };
      creditsUtilsService.addOrganizationCreditsWithExpiration.mockRejectedValue(
        uniqueConstraintError,
      );
      supportService.isUniqueConstraintError.mockReturnValue(true);

      await handler.handleInvoicePaid(
        invoiceWith({
          parent: {
            subscription_details: { subscription: 'sub_stripe_1' },
          },
        }),
        'test',
      );

      expect(supportService.isUniqueConstraintError).toHaveBeenCalledWith(
        uniqueConstraintError,
      );
      // handleInvoicePaid's outer catch only logs — it must not fire here,
      // proving the P2002 was swallowed locally as a duplicate no-op.
      expect(loggerService.error).not.toHaveBeenCalled();
      expect(supportService.recordCreditsActivity).not.toHaveBeenCalled();
    });

    it('#1398: treats a P2002 unique-constraint race on the yearly grant as a no-op, not an error', async () => {
      subscriptionsService.findOne.mockResolvedValue({
        ...monthlySubscription,
        plan: SubscriptionPlan.YEARLY,
      });
      creditGrantService.resolvePlanCredits.mockResolvedValue(70_800);
      const uniqueConstraintError = { code: 'P2002' };
      creditsUtilsService.resetOrganizationCredits.mockRejectedValue(
        uniqueConstraintError,
      );
      supportService.isUniqueConstraintError.mockReturnValue(true);

      await handler.handleInvoicePaid(
        invoiceWith({
          parent: {
            subscription_details: { subscription: 'sub_stripe_1' },
          },
        }),
        'test',
      );

      expect(creditsUtilsService.resetOrganizationCredits).toHaveBeenCalledWith(
        'org_1',
        70_800,
        'yearly',
        expect.stringContaining('yearly'),
        expect.objectContaining({
          referenceId: 'stripe-invoice:in_123',
          referenceType: 'stripe-invoice:subscription-grant',
        }),
      );
      expect(supportService.isUniqueConstraintError).toHaveBeenCalledWith(
        uniqueConstraintError,
      );
      // handleInvoicePaid's outer catch only logs — it must not fire here,
      // proving the P2002 was swallowed locally as a duplicate no-op.
      expect(loggerService.error).not.toHaveBeenCalled();
      expect(supportService.recordCreditsActivity).not.toHaveBeenCalled();
    });

    it('routes BYOK platform fee invoices to the BYOK path', async () => {
      await handler.handleInvoicePaid(
        invoiceWith({
          amount_paid: 12_50,
          metadata: { organizationId: 'org_1', type: 'byok_platform_fee' },
        }),
        'test',
      );

      expect(supportService.setByokBillingStatus).toHaveBeenCalledWith(
        'org_1',
        ByokBillingStatus.ACTIVE,
        'in_123',
        'test',
        'failed to reset byokBillingStatus after payment',
      );
      expect(supportService.recordCreditsActivity).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: 'org_1',
          value: expect.stringContaining('BYOK platform fee paid'),
        }),
      );
      expect(subscriptionsService.findOne).not.toHaveBeenCalled();
    });
  });

  describe('handleInvoicePaymentFailed', () => {
    it('reads the subscription id from the v22 parent path and marks past_due', async () => {
      await handler.handleInvoicePaymentFailed(
        invoiceWith({
          billing_reason: 'subscription_cycle',
          parent: {
            subscription_details: { subscription: 'sub_stripe_1' },
          },
        }),
        'test',
      );

      expect(subscriptionsService.findOne).toHaveBeenCalledWith({
        stripeSubscriptionId: 'sub_stripe_1',
      });
      expect(subscriptionsService.patch).toHaveBeenCalledWith('sub_db_1', {
        status: SubscriptionStatus.PAST_DUE,
      });
    });

    it('does not query subscriptions when the invoice carries no subscription id', async () => {
      await handler.handleInvoicePaymentFailed(invoiceWith({}), 'test');

      expect(subscriptionsService.findOne).not.toHaveBeenCalled();
    });

    it('sets the BYOK billing status to past_due for BYOK fee failures', async () => {
      await handler.handleInvoicePaymentFailed(
        invoiceWith({
          metadata: { organizationId: 'org_1', type: 'byok_platform_fee' },
        }),
        'test',
      );

      expect(supportService.setByokBillingStatus).toHaveBeenCalledWith(
        'org_1',
        ByokBillingStatus.PAST_DUE,
        'in_123',
        'test',
        'failed to set past_due status after payment failure',
      );
      expect(subscriptionsService.findOne).not.toHaveBeenCalled();
    });
  });
});
