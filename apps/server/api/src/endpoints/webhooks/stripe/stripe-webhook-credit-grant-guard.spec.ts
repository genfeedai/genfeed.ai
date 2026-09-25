/**
 * Proves the #4737 follow-up: a billing-account relink that lands between the
 * guarded `subscriptions` write and the credit reconciliation cannot move plan
 * credits onto the replacement account. Real handlers, resolver, reconciler,
 * and credits ledger service; only persistence and the billing-account lookup
 * are mocked so the account can change mid-callback.
 */
import { BillingAccountsService } from '@api/collections/billing-accounts/services/billing-accounts.service';
import { CreditBalanceService } from '@api/collections/credits/services/credit-balance.service';
import { CreditReservationService } from '@api/collections/credits/services/credit-reservation.service';
import { CreditTransactionsService } from '@api/collections/credits/services/credit-transactions.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { UsersService } from '@api/collections/users/services/users.service';
import { AccessBootstrapCacheService } from '@api/common/services/access-bootstrap-cache.service';
import { SubscriptionCreditGrantService } from '@api/common/subscriptions/subscription-credit-grant.service';
import { StripeInvoiceWebhookHandler } from '@api/endpoints/webhooks/stripe/handlers/stripe-invoice-webhook.handler';
import { StripeSubscriptionCreditReconcilerService } from '@api/endpoints/webhooks/stripe/handlers/stripe-subscription-credit-reconciler.service';
import { StripeWebhookSupportService } from '@api/endpoints/webhooks/stripe/handlers/stripe-webhook-support.service';
import { StripeWebhookBillingError } from '@api/endpoints/webhooks/stripe/stripe-webhook-billing.error';
import { StripeWebhookBillingService } from '@api/endpoints/webhooks/stripe/stripe-webhook-billing.service';
import type { PrismaTransactionClient } from '@api/helpers/utils/transaction/transaction.util';
import { TransactionUtil } from '@api/helpers/utils/transaction/transaction.util';
import type { StripeInvoice } from '@api/services/integrations/stripe/services/stripe.service';
import { NotificationsPublisherService } from '@api/services/notifications/publisher/notifications-publisher.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { SubscriptionPlan } from '@genfeedai/contracts';
import { SUBSCRIPTIONS_SERVICE } from '@genfeedai/contracts/interfaces/billing';
import { LoggerService } from '@libs/logger/logger.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ACCOUNT = {
  id: 'ba_1',
  isDeleted: false,
  stripeCustomerId: null,
};
const REPLACEMENT_ACCOUNT = {
  id: 'ba_2',
  isDeleted: false,
  stripeCustomerId: null,
};

describe('Stripe webhook credit grant guard (relink between persist and reconcile)', () => {
  let handler: StripeInvoiceWebhookHandler;

  const logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
  const subscriptionRow = {
    billingAccountId: 'ba_1',
    cancelAtPeriodEnd: false,
    customerId: 'customer_1',
    id: 'db_sub',
    isDeleted: false,
    organizationId: 'org_1',
    plan: SubscriptionPlan.MONTHLY,
    status: 'active',
    stripePriceId: 'price_1',
    stripeSubscriptionId: 'sub_1',
    userId: 'user_1',
  };
  const prisma = {
    customer: { findFirst: vi.fn(), findMany: vi.fn() },
    organization: { findFirst: vi.fn() },
    subscription: { findMany: vi.fn(), updateMany: vi.fn() },
  };
  const accounts = { resolveForOrganization: vi.fn() };
  const creditBalanceService = {
    getOrCreateBalance: vi.fn(),
    toSnapshot: vi.fn(),
    updateBalance: vi.fn(),
  };
  const creditTransactionsService = {
    createTransactionEntry: vi.fn(),
    findOne: vi.fn(),
  };
  const txClient = {} as PrismaTransactionClient;
  const transactionUtil = {
    runInTransaction: vi.fn(
      async (fn: (tx: PrismaTransactionClient) => Promise<unknown>) =>
        fn(txClient),
    ),
  };
  const support = {
    hasSubscriptionCreditGrant: vi.fn(),
    isUniqueConstraintError: vi.fn(() => false),
    markOnboardingComplete: vi.fn(),
    recordCreditsActivity: vi.fn(),
    recordRevenueEvent: vi.fn(),
    resolveSubscriptionPlan: vi.fn(() => SubscriptionPlan.MONTHLY),
    resolveTierFromPriceId: vi.fn(() => null),
    setHasEverHadCredits: vi.fn(),
    updateOrganizationTierAndModels: vi.fn(),
  };
  const subscriptions = { syncSubscriptionState: vi.fn() };
  const websocket = { emit: vi.fn() };
  const accessBootstrapCache = {
    invalidateForOrganization: vi.fn(),
    invalidateForUser: vi.fn(),
  };

  function invoiceWith(
    billingReason: 'subscription_create' | 'subscription_cycle',
  ): StripeInvoice {
    return {
      billing_reason: billingReason,
      customer: 'cus_1',
      id: `in_${billingReason}`,
      parent: { subscription_details: { subscription: 'sub_1' } },
    } as unknown as StripeInvoice;
  }

  /** The wallet reflects whichever account the organization resolves to now. */
  function walletOn(account: { id: string }) {
    accounts.resolveForOrganization.mockResolvedValue(account);
    creditBalanceService.getOrCreateBalance.mockResolvedValue({
      balance: 100,
      billingAccountId: account.id,
      heldAmount: 0,
      id: `bal_${account.id}`,
      organizationId: 'org_1',
      version: 1,
    });
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    prisma.subscription.findMany.mockResolvedValue([subscriptionRow]);
    prisma.subscription.updateMany.mockResolvedValue({ count: 1 });
    prisma.customer.findFirst.mockResolvedValue({
      billingAccountId: 'ba_1',
      id: 'customer_1',
      isDeleted: false,
      organizationId: 'org_1',
      stripeCustomerId: 'cus_1',
    });
    prisma.organization.findFirst.mockResolvedValue({ id: 'org_1' });
    creditBalanceService.toSnapshot.mockImplementation(
      (row: {
        balance: number;
        billingAccountId: string;
        heldAmount: number;
        id: string;
        organizationId: string;
        version: number;
      }) => ({
        available: row.balance - row.heldAmount,
        billingAccountId: row.billingAccountId,
        held: row.heldAmount,
        id: row.id,
        organizationId: row.organizationId,
        settled: row.balance,
        version: row.version,
      }),
    );
    creditBalanceService.updateBalance.mockResolvedValue({ balance: 5_900 });
    creditTransactionsService.createTransactionEntry.mockResolvedValue({});
    creditTransactionsService.findOne.mockResolvedValue(null);
    support.hasSubscriptionCreditGrant.mockResolvedValue(false);
    walletOn(ORIGINAL_ACCOUNT);

    const module = await Test.createTestingModule({
      providers: [
        StripeInvoiceWebhookHandler,
        StripeWebhookBillingService,
        StripeSubscriptionCreditReconcilerService,
        CreditsUtilsService,
        { provide: LoggerService, useValue: logger },
        { provide: PrismaService, useValue: prisma },
        { provide: BillingAccountsService, useValue: accounts },
        { provide: CreditBalanceService, useValue: creditBalanceService },
        {
          provide: CreditTransactionsService,
          useValue: creditTransactionsService,
        },
        { provide: TransactionUtil, useValue: transactionUtil },
        { provide: StripeWebhookSupportService, useValue: support },
        { provide: SUBSCRIPTIONS_SERVICE, useValue: subscriptions },
        {
          provide: SubscriptionCreditGrantService,
          useValue: {
            logUnresolvedGrant: vi.fn(),
            resolvePlanCredits: vi.fn(async () => 5_900),
          },
        },
        { provide: NotificationsPublisherService, useValue: websocket },
        {
          provide: AccessBootstrapCacheService,
          useValue: accessBootstrapCache,
        },
        { provide: UsersService, useValue: { findOne: vi.fn() } },
        { provide: EventEmitter2, useValue: { emit: vi.fn() } },
        { provide: CreditReservationService, useValue: {} },
        {
          provide: OrganizationSettingsService,
          useValue: { findOne: vi.fn(async () => null), patch: vi.fn() },
        },
      ],
    }).compile();

    handler = module.get(StripeInvoiceWebhookHandler);
  });

  // invoice.paid carries both the initial grant (subscription_create, keyed by
  // the subscription) and renewals (subscription_cycle, keyed by the invoice).
  it.each(['subscription_create', 'subscription_cycle'] as const)(
    'refuses the %s grant when the organization is relinked after the subscription write',
    async (billingReason) => {
      // Identity resolves against the account the subscription row references;
      // every later lookup (the grant-time wallet) sees the replacement.
      accounts.resolveForOrganization.mockResolvedValueOnce(ORIGINAL_ACCOUNT);
      walletOn(REPLACEMENT_ACCOUNT);

      const attempt = handler.handleInvoicePaid(
        invoiceWith(billingReason),
        'test',
      );

      await expect(attempt).rejects.toBeInstanceOf(StripeWebhookBillingError);
      // Stale, not proven conflicting: Stripe's redelivery re-resolves
      // against the current link instead of dropping the paid grant.
      await expect(attempt).rejects.toMatchObject({
        code: 'identity_stale',
        isRetryable: true,
      });
      // The guarded subscription write already happened — that is the window.
      expect(prisma.subscription.updateMany).toHaveBeenCalledTimes(1);
      // ...but not one credit moved, on either account.
      expect(creditBalanceService.updateBalance).not.toHaveBeenCalled();
      expect(
        creditTransactionsService.createTransactionEntry,
      ).not.toHaveBeenCalled();
      expect(support.recordCreditsActivity).not.toHaveBeenCalled();
      expect(support.setHasEverHadCredits).not.toHaveBeenCalled();
      expect(websocket.emit).not.toHaveBeenCalled();
    },
  );

  it('grants onto the referenced account when no relink happens', async () => {
    await handler.handleInvoicePaid(invoiceWith('subscription_cycle'), 'test');

    expect(creditBalanceService.updateBalance).toHaveBeenCalledExactlyOnceWith(
      'org_1',
      6_000,
      'ba_1',
      txClient,
    );
    expect(
      creditTransactionsService.createTransactionEntry,
    ).toHaveBeenCalledTimes(1);
    expect(logger.error).not.toHaveBeenCalled();
  });
});
