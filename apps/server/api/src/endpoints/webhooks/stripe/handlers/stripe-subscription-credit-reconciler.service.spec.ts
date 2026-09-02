import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { SubscriptionCreditGrantService } from '@api/common/subscriptions/subscription-credit-grant.service';
import { StripeSubscriptionCreditReconcilerService } from '@api/endpoints/webhooks/stripe/handlers/stripe-subscription-credit-reconciler.service';
import { StripeWebhookSupportService } from '@api/endpoints/webhooks/stripe/handlers/stripe-webhook-support.service';
import { SubscriptionPlan, SubscriptionStatus } from '@genfeedai/enums';
import type { ISubscriptionOssReadModel } from '@genfeedai/interfaces/billing';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, type TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('StripeSubscriptionCreditReconcilerService', () => {
  let service: StripeSubscriptionCreditReconcilerService;

  const loggerService = { log: vi.fn(), warn: vi.fn() };
  const creditGrantService = {
    logUnresolvedGrant: vi.fn(),
    resolvePlanCredits: vi.fn(),
  };
  const creditsUtilsService = {
    addOrganizationCreditsWithExpiration: vi.fn(),
    getOrganizationCreditsBalance: vi.fn(),
    resetOrganizationCredits: vi.fn(),
  };
  const supportService = {
    hasSubscriptionCreditGrant: vi.fn(),
    isUniqueConstraintError: vi.fn(),
    recordCreditsActivity: vi.fn(),
    setHasEverHadCredits: vi.fn(),
  };

  const periodStart = new Date('2026-07-01T00:00:00.000Z');
  const periodEnd = new Date('2026-08-01T00:00:00.000Z');
  const monthlySubscription = {
    cancelAtPeriodEnd: false,
    id: 'sub_db_1',
    isDeleted: false,
    organizationId: 'org_1',
    plan: SubscriptionPlan.MONTHLY,
    status: 'active',
    stripePriceId: 'price_pro',
    stripeSubscriptionId: 'sub_stripe_1',
    userId: 'user_1',
  } satisfies ISubscriptionOssReadModel;

  beforeEach(async () => {
    vi.clearAllMocks();
    creditsUtilsService.getOrganizationCreditsBalance.mockResolvedValue(5_900);
    creditGrantService.resolvePlanCredits.mockResolvedValue(5_900);
    supportService.hasSubscriptionCreditGrant.mockResolvedValue(false);
    supportService.isUniqueConstraintError.mockReturnValue(false);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StripeSubscriptionCreditReconcilerService,
        { provide: LoggerService, useValue: loggerService },
        { provide: CreditsUtilsService, useValue: creditsUtilsService },
        {
          provide: SubscriptionCreditGrantService,
          useValue: creditGrantService,
        },
        { provide: StripeWebhookSupportService, useValue: supportService },
      ],
    }).compile();

    service = module.get(StripeSubscriptionCreditReconcilerService);
  });

  it('allocates the initial monthly grant from subscription.created with a durable subscription key', async () => {
    await expect(
      service.reconcile({
        billingReason: 'subscription_create',
        periodEnd,
        periodStart,
        stripeSubscriptionId: 'sub_stripe_1',
        subscription: monthlySubscription,
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        trigger: 'customer.subscription.created',
        url: 'test',
      }),
    ).resolves.toBe(true);

    expect(supportService.hasSubscriptionCreditGrant).toHaveBeenCalledWith(
      'org_1',
      {
        legacyPeriod: {
          end: periodEnd,
          source: SubscriptionPlan.MONTHLY,
          start: periodStart,
        },
        reference: {
          referenceId: 'stripe-subscription:sub_stripe_1',
          referenceType: 'stripe-subscription:initial-grant',
        },
      },
    );
    expect(
      creditsUtilsService.addOrganizationCreditsWithExpiration,
    ).toHaveBeenCalledWith(
      'org_1',
      5_900,
      SubscriptionPlan.MONTHLY,
      expect.stringContaining('monthly'),
      expect.any(Date),
      expect.objectContaining({
        metadata: expect.objectContaining({
          billingReason: 'subscription_create',
          stripeSubscriptionId: 'sub_stripe_1',
          trigger: 'customer.subscription.created',
        }),
        referenceId: 'stripe-subscription:sub_stripe_1',
        referenceType: 'stripe-subscription:initial-grant',
      }),
    );
    expect(loggerService.log).toHaveBeenCalledWith(
      expect.stringContaining('subscription credits reconciled'),
      expect.objectContaining({
        outcome: 'allocated',
        trigger: 'customer.subscription.created',
      }),
    );
  });

  it('recognizes the legacy invoice reference while converging invoice.paid on the initial key', async () => {
    supportService.hasSubscriptionCreditGrant.mockResolvedValue(true);

    await expect(
      service.reconcile({
        billingReason: 'subscription_create',
        invoiceId: 'in_123',
        periodEnd,
        periodStart,
        stripeSubscriptionId: 'sub_stripe_1',
        subscription: monthlySubscription,
        trigger: 'invoice.paid',
        url: 'test',
      }),
    ).resolves.toBe(false);

    expect(supportService.hasSubscriptionCreditGrant).toHaveBeenCalledWith(
      'org_1',
      {
        legacyInvoiceReference: {
          referenceId: 'stripe-invoice:in_123',
          referenceType: 'stripe-invoice:subscription-grant',
        },
        legacyPeriod: {
          end: periodEnd,
          source: SubscriptionPlan.MONTHLY,
          start: periodStart,
        },
        reference: {
          referenceId: 'stripe-subscription:sub_stripe_1',
          referenceType: 'stripe-subscription:initial-grant',
        },
      },
    );
    expect(
      creditsUtilsService.addOrganizationCreditsWithExpiration,
    ).not.toHaveBeenCalled();
    expect(loggerService.log).toHaveBeenCalledWith(
      expect.stringContaining('reconciliation skipped'),
      expect.objectContaining({ outcome: 'existing_grant' }),
    );
  });

  it('grants once when invoice.paid arrives before subscription.created', async () => {
    const appliedReferences = new Set<string>();
    supportService.hasSubscriptionCreditGrant.mockImplementation(
      async (
        _organizationId: string,
        lookup: {
          reference: { referenceId: string; referenceType: string };
        },
      ) =>
        appliedReferences.has(
          `${lookup.reference.referenceType}:${lookup.reference.referenceId}`,
        ),
    );
    creditsUtilsService.addOrganizationCreditsWithExpiration.mockImplementation(
      async (
        _organizationId: string,
        _credits: number,
        _source: string,
        _description: string,
        _expiresAt: Date,
        options: { referenceId: string; referenceType: string },
      ) => {
        appliedReferences.add(
          `${options.referenceType}:${options.referenceId}`,
        );
      },
    );

    const invoiceResult = await service.reconcile({
      billingReason: 'subscription_create',
      invoiceId: 'in_early',
      periodEnd,
      periodStart,
      stripeSubscriptionId: 'sub_stripe_1',
      subscription: monthlySubscription,
      trigger: 'invoice.paid',
      url: 'test',
    });
    const subscriptionResult = await service.reconcile({
      billingReason: 'subscription_create',
      periodEnd,
      periodStart,
      stripeSubscriptionId: 'sub_stripe_1',
      subscription: monthlySubscription,
      subscriptionStatus: SubscriptionStatus.ACTIVE,
      trigger: 'customer.subscription.created',
      url: 'test',
    });

    expect(invoiceResult).toBe(true);
    expect(subscriptionResult).toBe(false);
    expect(
      creditsUtilsService.addOrganizationCreditsWithExpiration,
    ).toHaveBeenCalledTimes(1);
  });

  it('keeps recurring cycle grants keyed by invoice id', async () => {
    await service.reconcile({
      billingReason: 'subscription_cycle',
      invoiceId: 'in_cycle_1',
      periodEnd,
      periodStart,
      stripeSubscriptionId: 'sub_stripe_1',
      subscription: monthlySubscription,
      trigger: 'invoice.paid',
      url: 'test',
    });

    expect(supportService.hasSubscriptionCreditGrant).toHaveBeenCalledWith(
      'org_1',
      {
        reference: {
          referenceId: 'stripe-invoice:in_cycle_1',
          referenceType: 'stripe-invoice:subscription-grant',
        },
      },
    );
  });

  it('does not grant credits for an incomplete subscription.created event', async () => {
    await expect(
      service.reconcile({
        billingReason: 'subscription_create',
        periodEnd,
        periodStart,
        stripeSubscriptionId: 'sub_stripe_1',
        subscription: monthlySubscription,
        subscriptionStatus: SubscriptionStatus.INCOMPLETE,
        trigger: 'customer.subscription.created',
        url: 'test',
      }),
    ).resolves.toBe(false);

    expect(supportService.hasSubscriptionCreditGrant).not.toHaveBeenCalled();
    expect(
      creditsUtilsService.addOrganizationCreditsWithExpiration,
    ).not.toHaveBeenCalled();
    expect(loggerService.log).toHaveBeenCalledWith(
      expect.stringContaining('reconciliation skipped'),
      expect.objectContaining({ outcome: 'ineligible_status' }),
    );
  });

  it('treats a unique-index race as an observed duplicate no-op', async () => {
    const uniqueConstraintError = { code: 'P2002' };
    creditsUtilsService.addOrganizationCreditsWithExpiration.mockRejectedValue(
      uniqueConstraintError,
    );
    supportService.isUniqueConstraintError.mockReturnValue(true);

    await expect(
      service.reconcile({
        billingReason: 'subscription_create',
        stripeSubscriptionId: 'sub_stripe_1',
        subscription: monthlySubscription,
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        trigger: 'customer.subscription.created',
        url: 'test',
      }),
    ).resolves.toBe(false);

    expect(supportService.recordCreditsActivity).not.toHaveBeenCalled();
    expect(loggerService.log).toHaveBeenCalledWith(
      expect.stringContaining('reconciliation skipped'),
      expect.objectContaining({ outcome: 'unique_constraint_race' }),
    );
  });

  it('propagates credit ledger failures for webhook retry', async () => {
    const ledgerError = new Error('ledger unavailable');
    creditsUtilsService.addOrganizationCreditsWithExpiration.mockRejectedValue(
      ledgerError,
    );

    await expect(
      service.reconcile({
        billingReason: 'subscription_create',
        stripeSubscriptionId: 'sub_stripe_1',
        subscription: monthlySubscription,
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        trigger: 'customer.subscription.created',
        url: 'test',
      }),
    ).rejects.toBe(ledgerError);
  });

  it('grants nothing and tells an operator when the price carries no credit grant', async () => {
    creditGrantService.resolvePlanCredits.mockResolvedValue(null);

    await expect(
      service.reconcile({
        billingReason: 'subscription_create',
        periodEnd,
        periodStart,
        stripeSubscriptionId: 'sub_stripe_1',
        subscription: monthlySubscription,
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        trigger: 'customer.subscription.created',
        url: 'test',
      }),
    ).resolves.toBe(false);

    expect(
      creditsUtilsService.addOrganizationCreditsWithExpiration,
    ).not.toHaveBeenCalled();
    expect(creditGrantService.logUnresolvedGrant).toHaveBeenCalledWith('test', {
      organizationId: 'org_1',
      stripePriceId: 'price_pro',
    });
    expect(loggerService.warn).toHaveBeenCalledWith(
      expect.stringContaining('reconciliation skipped'),
      expect.objectContaining({ outcome: 'no_credit_allocation' }),
    );
  });
});
