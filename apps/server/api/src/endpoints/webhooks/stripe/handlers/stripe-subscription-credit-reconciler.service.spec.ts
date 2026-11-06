import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { SubscriptionCreditGrantService } from '@api/common/subscriptions/subscription-credit-grant.service';
import { StripeSubscriptionCreditReconcilerService } from '@api/endpoints/webhooks/stripe/handlers/stripe-subscription-credit-reconciler.service';
import type { StripeWebhookSupportService } from '@api/endpoints/webhooks/stripe/handlers/stripe-webhook-support.service';
import { StripeWebhookBillingError } from '@api/endpoints/webhooks/stripe/stripe-webhook-billing.error';
import { CreditGrantBillingAccountMismatchException } from '@api/exceptions/business-logic.exception';
import {
  ActivityKey,
  ActivitySource,
  SubscriptionPlan,
  SubscriptionStatus,
} from '@genfeedai/contracts';
import type { ISubscriptionOssReadModel } from '@genfeedai/contracts/interfaces/billing';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it } from 'vitest';

type Row = Record<string, unknown>;
type Reconciliation = Parameters<
  StripeSubscriptionCreditReconcilerService['reconcile']
>[0];

interface Grant {
  amount: number;
  billingAccountId: string;
  kind: 'add' | 'reset';
  metadata: Row;
  organizationId: string;
  referenceId: string;
  referenceType: string;
  source: string;
}

interface Reference {
  referenceId: string;
  referenceType: string;
}

const periodStart = new Date('2026-07-01T00:00:00.000Z');
const periodEnd = new Date('2026-08-01T00:00:00.000Z');
const monthly = {
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

const INITIAL = {
  referenceId: 'stripe-subscription:sub_stripe_1',
  referenceType: 'stripe-subscription:initial-grant',
};
const invoiceReference = (invoiceId: string) => ({
  referenceId: `stripe-invoice:${invoiceId}`,
  referenceType: 'stripe-invoice:subscription-grant',
});

const created = (fields: Partial<Reconciliation> = {}): Reconciliation => ({
  billingAccountId: 'ba_1',
  billingReason: 'subscription_create',
  periodEnd,
  periodStart,
  stripeSubscriptionId: 'sub_stripe_1',
  subscription: monthly,
  subscriptionStatus: SubscriptionStatus.ACTIVE,
  trigger: 'customer.subscription.created',
  url: 'test',
  ...fields,
});
const renewal = (invoiceId: string, fields: Partial<Reconciliation> = {}) =>
  created({
    billingReason: 'subscription_cycle',
    invoiceId,
    subscriptionStatus: undefined,
    trigger: 'invoice.paid',
    ...fields,
  });

describe('StripeSubscriptionCreditReconcilerService', () => {
  // The credit ledger and everything else a reconciliation leaves behind.
  let grants: Grant[];
  let linkedBillingAccount: string;
  let ledgerFailure: Error | undefined;
  let concurrentGrant: Reference | undefined;
  let activities: Row[];
  let creditedOrganizations: string[];
  let unresolvedGrants: Row[];
  let logs: [string, Row][];
  let warnings: [string, Row][];
  let service: StripeSubscriptionCreditReconcilerService;

  const outcomes = () =>
    [...logs, ...warnings].map(([, context]) => context.outcome);

  beforeEach(() => {
    grants = [];
    linkedBillingAccount = 'ba_1';
    ledgerFailure = undefined;
    concurrentGrant = undefined;
    activities = [];
    creditedOrganizations = [];
    unresolvedGrants = [];
    logs = [];
    warnings = [];

    const hasReference = (reference?: Reference) =>
      Boolean(reference) &&
      grants.some(
        (grant) =>
          grant.referenceId === reference?.referenceId &&
          grant.referenceType === reference?.referenceType,
      );
    // The ledger: unique per reference, pinned to the linked billing account.
    const write = (grant: Grant) => {
      if (ledgerFailure) throw ledgerFailure;
      if (grant.billingAccountId !== linkedBillingAccount) {
        throw new CreditGrantBillingAccountMismatchException(
          grant.billingAccountId,
          linkedBillingAccount,
        );
      }
      if (concurrentGrant) grants.push({ ...grant, ...concurrentGrant });
      if (hasReference(grant)) throw { code: 'P2002' };
      grants.push(grant);
    };

    service = new StripeSubscriptionCreditReconcilerService(
      {
        log: (message: string, context: Row) => {
          logs.push([message, context]);
        },
        warn: (message: string, context: Row) => {
          warnings.push([message, context]);
        },
      } as unknown as LoggerService,
      {
        addOrganizationCreditsWithExpiration: async (
          organizationId: string,
          amount: number,
          source: string,
          _description: string,
          _expiresAt: Date,
          options: Omit<Grant, 'amount' | 'kind' | 'organizationId' | 'source'>,
        ) => write({ ...options, amount, kind: 'add', organizationId, source }),
        getOrganizationCreditsBalance: async (organizationId: string) =>
          grants
            .filter((grant) => grant.organizationId === organizationId)
            .reduce((sum, grant) => sum + grant.amount, 0),
        resetOrganizationCredits: async (
          organizationId: string,
          amount: number,
          source: string,
          _description: string,
          options: Omit<Grant, 'amount' | 'kind' | 'organizationId' | 'source'>,
        ) =>
          write({ ...options, amount, kind: 'reset', organizationId, source }),
      } as unknown as CreditsUtilsService,
      {
        logUnresolvedGrant: (_url: string, details: Row) => {
          unresolvedGrants.push(details);
        },
        resolvePlanCredits: async (_plan: string, priceId: string) =>
          priceId === 'price_pro' ? 5_900 : null,
      } as unknown as SubscriptionCreditGrantService,
      {
        hasSubscriptionCreditGrant: async (
          _organizationId: string,
          lookup: {
            legacyInvoiceReference?: Reference;
            legacyPeriod?: { end: Date; source: string; start: Date };
            reference: Reference;
          },
        ) =>
          hasReference(lookup.reference) ||
          hasReference(lookup.legacyInvoiceReference) ||
          grants.some(
            (grant) =>
              grant.source === lookup.legacyPeriod?.source &&
              grant.metadata.periodStart ===
                lookup.legacyPeriod?.start.toISOString(),
          ),
        isUniqueConstraintError: (error: { code?: string }) =>
          error?.code === 'P2002',
        recordCreditsActivity: async (activity: Row) => {
          activities.push(activity);
        },
        setHasEverHadCredits: async (organizationId: string) => {
          creditedOrganizations.push(organizationId);
        },
      } as unknown as StripeWebhookSupportService,
    );
  });

  it('allocates the initial monthly grant from subscription.created under the durable subscription key', async () => {
    await expect(service.reconcile(created())).resolves.toBe(true);

    expect(grants).toEqual([
      {
        ...INITIAL,
        amount: 5_900,
        billingAccountId: 'ba_1',
        kind: 'add',
        metadata: {
          billingReason: 'subscription_create',
          periodEnd: periodEnd.toISOString(),
          periodStart: periodStart.toISOString(),
          stripeSubscriptionId: 'sub_stripe_1',
          trigger: 'customer.subscription.created',
        },
        organizationId: 'org_1',
        source: SubscriptionPlan.MONTHLY,
      },
    ]);
    expect(activities).toEqual([
      {
        key: ActivityKey.CREDITS_ADD,
        organizationId: 'org_1',
        source: ActivitySource.SUBSCRIPTION,
        userId: 'user_1',
        value: '5900',
      },
    ]);
    expect(creditedOrganizations).toEqual(['org_1']);
    expect(logs).toEqual([
      [
        expect.stringContaining('subscription credits reconciled'),
        expect.objectContaining({
          currentBalance: 5_900,
          outcome: 'allocated',
        }),
      ],
    ]);
  });

  it.each([
    [
      'a legacy invoice-keyed grant',
      { ...invoiceReference('in_123'), metadata: {} },
    ],
    [
      'a legacy grant for the same period',
      {
        metadata: { periodStart: periodStart.toISOString() },
        referenceId: 'legacy',
        referenceType: 'legacy',
      },
    ],
  ])(
    'recognizes %s and converges invoice.paid on the initial key',
    async (_case, legacy) => {
      grants.push({
        amount: 5_900,
        billingAccountId: 'ba_1',
        kind: 'add',
        organizationId: 'org_1',
        source: SubscriptionPlan.MONTHLY,
        ...legacy,
      });

      await expect(
        service.reconcile(
          created({
            invoiceId: 'in_123',
            subscriptionStatus: undefined,
            trigger: 'invoice.paid',
          }),
        ),
      ).resolves.toBe(false);

      expect(grants).toHaveLength(1);
      expect(outcomes()).toEqual(['existing_grant']);
    },
  );

  it('grants once when invoice.paid arrives before subscription.created', async () => {
    const invoiceResult = await service.reconcile(
      created({
        invoiceId: 'in_early',
        subscriptionStatus: undefined,
        trigger: 'invoice.paid',
      }),
    );
    // Lowercase, exactly as the handler forwards it off the Stripe object.
    const subscriptionResult = await service.reconcile(
      created({ subscriptionStatus: 'active' }),
    );

    expect([invoiceResult, subscriptionResult]).toEqual([true, false]);
    expect(grants.map(({ referenceId }) => referenceId)).toEqual([
      INITIAL.referenceId,
    ]);
    // The second event is refused as a duplicate grant, not waved away as an
    // ineligible status: that distinction is the #4824 regression.
    expect(outcomes()).toEqual(['allocated', 'existing_grant']);
  });

  it('keys each recurring cycle grant by its invoice', async () => {
    await service.reconcile(renewal('in_cycle_1'));
    await service.reconcile(renewal('in_cycle_2'));
    await service.reconcile(renewal('in_cycle_2'));

    expect(grants.map(({ referenceId }) => referenceId)).toEqual([
      'stripe-invoice:in_cycle_1',
      'stripe-invoice:in_cycle_2',
    ]);
  });

  it.each(['active', 'trialing'])(
    '#4824: grants on a subscription.created event carrying Stripe status %j',
    async (subscriptionStatus) => {
      await expect(
        service.reconcile(created({ subscriptionStatus })),
      ).resolves.toBe(true);

      expect(grants).toHaveLength(1);
      expect(outcomes()).toEqual(['allocated']);
    },
  );

  it.each([
    'past_due',
    'incomplete',
    'incomplete_expired',
    'unpaid',
    'paused',
    'nonsense',
  ])(
    '#4824: refuses a subscription.created event carrying status %j',
    async (subscriptionStatus) => {
      await expect(
        service.reconcile(created({ subscriptionStatus })),
      ).resolves.toBe(false);

      expect(grants).toEqual([]);
      expect(outcomes()).toEqual(['ineligible_status']);
    },
  );

  it.each([
    [
      'the subscription has no organization',
      created({ subscription: { ...monthly, organizationId: '' } }),
      'missing_organization',
    ],
    [
      'a renewal carries no invoice id',
      renewal('', { invoiceId: undefined }),
      'missing_invoice_id',
    ],
  ])('skips with a warning when %s', async (_case, input, outcome) => {
    await expect(service.reconcile(input)).resolves.toBe(false);

    expect(grants).toEqual([]);
    expect(warnings).toEqual([
      [
        expect.stringContaining('reconciliation skipped'),
        expect.objectContaining({ outcome }),
      ],
    ]);
  });

  it('treats a unique-index race as an observed duplicate no-op', async () => {
    concurrentGrant = INITIAL;

    await expect(service.reconcile(created())).resolves.toBe(false);

    expect(grants).toHaveLength(1);
    expect(activities).toEqual([]);
    expect(outcomes()).toEqual(['unique_constraint_race']);
  });

  it.each([
    [SubscriptionPlan.MONTHLY, 'add', ActivityKey.CREDITS_ADD],
    [SubscriptionPlan.YEARLY, 'reset', ActivityKey.CREDITS_RESET],
  ])(
    'pins the %s ledger write to the verified billing account',
    async (plan, kind, activity) => {
      await service.reconcile(
        renewal('in_cycle', { subscription: { ...monthly, plan } }),
      );

      expect(grants).toEqual([
        expect.objectContaining({
          billingAccountId: 'ba_1',
          kind,
          referenceId: 'stripe-invoice:in_cycle',
          source: plan,
        }),
      ]);
      expect(activities.map(({ key }) => key)).toEqual([activity]);
    },
  );

  it('classifies a billing-account relink refused by the ledger as retryable identity_stale', async () => {
    linkedBillingAccount = 'ba_2';

    const attempt = service.reconcile(created());

    await expect(attempt).rejects.toBeInstanceOf(StripeWebhookBillingError);
    await expect(attempt).rejects.toMatchObject({
      code: 'identity_stale',
      isRetryable: true,
    });
    expect(grants).toEqual([]);
    expect(activities).toEqual([]);
    expect(creditedOrganizations).toEqual([]);
  });

  it('propagates credit ledger failures for webhook retry', async () => {
    ledgerFailure = new Error('ledger unavailable');

    await expect(service.reconcile(created())).rejects.toBe(ledgerFailure);
    expect(activities).toEqual([]);
  });

  it('grants nothing and tells an operator when the price carries no credit grant', async () => {
    await expect(
      service.reconcile(
        created({
          subscription: { ...monthly, stripePriceId: 'price_unknown' },
        }),
      ),
    ).resolves.toBe(false);

    expect(grants).toEqual([]);
    expect(unresolvedGrants).toEqual([
      { organizationId: 'org_1', stripePriceId: 'price_unknown' },
    ]);
    expect(outcomes()).toEqual(['no_credit_allocation']);
  });
});
