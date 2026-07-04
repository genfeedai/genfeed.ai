import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import { ConfigService } from '@api/config/config.service';
import { StripeInvoiceWebhookHandler } from '@api/endpoints/webhooks/stripe/handlers/stripe-invoice-webhook.handler';
import { StripeWebhookSupportService } from '@api/endpoints/webhooks/stripe/handlers/stripe-webhook-support.service';
import { ByokBillingStatus } from '@genfeedai/enums';
import { SUBSCRIPTIONS_SERVICE } from '@genfeedai/interfaces/billing';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import type Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('StripeInvoiceWebhookHandler', () => {
  let handler: StripeInvoiceWebhookHandler;

  const configService = { get: vi.fn().mockReturnValue(undefined) };
  const loggerService = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
  const subscriptionsService = {
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
    markOnboardingComplete: vi.fn(),
    recordCreditsActivity: vi.fn(),
    setByokBillingStatus: vi.fn(),
    setHasEverHadCredits: vi.fn(),
  };

  function invoiceWith(overrides: Record<string, unknown>): Stripe.Invoice {
    return {
      billing_reason: 'subscription_cycle',
      id: 'in_123',
      metadata: {},
      ...overrides,
    } as unknown as Stripe.Invoice;
  }

  const monthlySubscription = {
    id: 'sub_db_1',
    organization: 'org_1',
    status: 'active',
    stripeSubscriptionId: 'sub_stripe_1',
    type: 'monthly',
    user: 'user_1',
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    configService.get.mockReturnValue(undefined);
    creditsUtilsService.getOrganizationCreditsBalance.mockResolvedValue(35_000);
    subscriptionsService.findOne.mockResolvedValue(monthlySubscription);
    subscriptionsService.patch.mockResolvedValue(monthlySubscription);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StripeInvoiceWebhookHandler,
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
      ],
    }).compile();

    handler = module.get(StripeInvoiceWebhookHandler);
  });

  describe('handleInvoicePaid', () => {
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
        35_000,
        'monthly',
        expect.stringContaining('monthly'),
        expect.any(Date),
      );
      expect(supportService.setHasEverHadCredits).toHaveBeenCalledWith(
        'org_1',
        'test',
      );
    });

    it('resets credits for yearly subscriptions', async () => {
      subscriptionsService.findOne.mockResolvedValue({
        ...monthlySubscription,
        type: 'yearly',
      });
      subscriptionsService.patch.mockResolvedValue({
        ...monthlySubscription,
        type: 'yearly',
      });

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
        500_000,
        'yearly',
        expect.stringContaining('yearly'),
      );
    });

    it('does not query subscriptions when the invoice carries no subscription id', async () => {
      await handler.handleInvoicePaid(invoiceWith({}), 'test');

      expect(subscriptionsService.findOne).not.toHaveBeenCalled();
      expect(loggerService.warn).toHaveBeenCalled();
    });

    it('warns and allocates nothing when the subscription is not found', async () => {
      subscriptionsService.findOne.mockResolvedValue(null);

      await handler.handleInvoicePaid(
        invoiceWith({
          parent: {
            subscription_details: { subscription: 'sub_missing' },
          },
        }),
        'test',
      );

      expect(loggerService.warn).toHaveBeenCalledWith(
        expect.stringContaining('subscription not found for invoice'),
        expect.objectContaining({ stripeSubscriptionId: 'sub_missing' }),
      );
      expect(
        creditsUtilsService.addOrganizationCreditsWithExpiration,
      ).not.toHaveBeenCalled();
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

      expect(supportService.markOnboardingComplete).toHaveBeenCalledWith({
        id: 'user_1',
        isOnboardingCompleted: false,
      });
      expect(
        accessBootstrapCacheService.invalidateForUser,
      ).toHaveBeenCalledWith('user_1');
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
        status: 'past_due',
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
