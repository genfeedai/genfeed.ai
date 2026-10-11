import { isSelfHostedDeployment, usesMeteredCredits } from '@genfeedai/config';
import { ActivitySource } from '@genfeedai/contracts';
import { resolveFreeTrialEndsAt } from '@genfeedai/contracts/constants';
import type { IFreeTrialState } from '@genfeedai/contracts/interfaces/billing';
import {
  BillingAccountOrganizationStatus,
  type Prisma,
  SubscriptionStatus,
} from '@genfeedai/prisma';

type FreeTrialStateClient = Pick<Prisma.TransactionClient, 'organization'>;

/** Every Stripe-backed credit grant namespaces its ledger reference with this. */
const STRIPE_REFERENCE_PREFIX = 'stripe-';
/** PAYG grants written before `ActivitySource.PAY_AS_YOU_GO` existed. */
const LEGACY_PAYG_SOURCE = 'pay-as-you-go';

export const FREE_TRIAL_NOT_APPLICABLE: Readonly<IFreeTrialState> =
  Object.freeze({ isTrialExpired: false, trialEndsAt: null });

/**
 * The hosted free trial only exists where Genfeed meters credits for its own
 * customers. Self-hosted deployments (including licensed ones that meter) and
 * billing-off deployments never see it.
 */
export function isFreeTrialEnforced(): boolean {
  return usesMeteredCredits() && !isSelfHostedDeployment();
}

/** A credit grant someone paid for: Stripe-backed, or a PAYG pack. */
export function paidCreditGrantWhere(): Prisma.CreditTransactionWhereInput {
  return {
    amount: { gt: 0 },
    isDeleted: false,
    OR: [
      { referenceType: { startsWith: STRIPE_REFERENCE_PREFIX } },
      {
        source: { in: [ActivitySource.PAY_AS_YOU_GO, LEGACY_PAYG_SOURCE] },
      },
    ],
  };
}

/**
 * Credits an operator granted on purpose: a superadmin comp
 * (`ActivitySource.SUPERADMIN`), proactive-onboarding seeding
 * (`ProactiveOnboardingService`) and warm-up preparation or handoff grants
 * (`creditWarmupWallet`, reference type `warmup-account`). An operator comp
 * never expires, so it exempts the organization from the trial exactly like
 * a purchase.
 */
const OPERATOR_CREDIT_GRANT_SOURCES: readonly string[] = [
  ActivitySource.SUPERADMIN,
  'proactive-onboarding',
  'warmup-handoff',
  'warmup-preparation',
];
const WARMUP_GRANT_REFERENCE_TYPE = 'warmup-account';

export function operatorCreditGrantWhere(): Prisma.CreditTransactionWhereInput {
  return {
    amount: { gt: 0 },
    isDeleted: false,
    OR: [
      { source: { in: [...OPERATOR_CREDIT_GRANT_SOURCES] } },
      { referenceType: WARMUP_GRANT_REFERENCE_TYPE },
    ],
  };
}

/** Any grant that takes an organization out of the trial: paid or comped. */
export function trialExemptingGrantWhere(): Prisma.CreditTransactionWhereInput {
  return { OR: [paidCreditGrantWhere(), operatorCreditGrantWhere()] };
}

/**
 * A subscription Stripe created (any status, so a lapsed payer still counts as
 * having paid) or one that is active or trialing right now. A checkout that
 * was started and abandoned leaves an `INCOMPLETE` row with no Stripe id,
 * which is not a payment.
 */
export function paidSubscriptionWhere(): Prisma.SubscriptionWhereInput {
  return {
    isDeleted: false,
    OR: [
      { stripeSubscriptionId: { not: null } },
      {
        status: {
          in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.TRIALING],
        },
      },
    ],
  };
}

function trialSubjectSelect(organizationId: string) {
  return {
    billingAccount: {
      select: {
        creditTransactions: {
          select: { id: true },
          take: 1,
          where: trialExemptingGrantWhere(),
        },
        // Another organization on the same billing account shares the wallet,
        // so expiring "this" organization's credits would spend theirs.
        organizationLinks: {
          select: { id: true },
          take: 1,
          where: {
            isDeleted: false,
            organization: { isDeleted: false },
            organizationId: { not: organizationId },
            status: BillingAccountOrganizationStatus.LINKED,
          },
        },
        organizations: {
          select: { id: true },
          take: 1,
          where: { id: { not: organizationId }, isDeleted: false },
        },
        subscriptions: {
          select: { id: true },
          take: 1,
          where: paidSubscriptionWhere(),
        },
      },
    },
    createdAt: true,
    creditTransactions: {
      select: { id: true },
      take: 1,
      where: trialExemptingGrantWhere(),
    },
    isProactiveOnboarding: true,
    subscriptions: {
      select: { id: true },
      take: 1,
      where: paidSubscriptionWhere(),
    },
    user: {
      select: {
        userSubscription: {
          select: { isDeleted: true, stripeSubscriptionId: true },
        },
      },
    },
    warmupAccounts: {
      select: { id: true },
      take: 1,
      where: { isDeleted: false },
    },
  } satisfies Prisma.OrganizationSelect;
}

type TrialSubject = Prisma.OrganizationGetPayload<{
  select: ReturnType<typeof trialSubjectSelect>;
}>;

function isExemptFromTrial(organization: TrialSubject): boolean {
  const account = organization.billingAccount;
  const userSubscription = organization.user.userSubscription;
  return (
    organization.isProactiveOnboarding ||
    organization.warmupAccounts.length > 0 ||
    organization.subscriptions.length > 0 ||
    organization.creditTransactions.length > 0 ||
    Boolean(
      userSubscription &&
        !userSubscription.isDeleted &&
        userSubscription.stripeSubscriptionId,
    ) ||
    Boolean(
      account &&
        (account.organizations.length > 0 ||
          account.organizationLinks.length > 0 ||
          account.subscriptions.length > 0 ||
          account.creditTransactions.length > 0),
    )
  );
}

/**
 * Where an organization stands in the hosted free trial. One read; usable
 * inside a transaction. Shared by admission, the expiry sweep, the bootstrap
 * and the trial emails so they always agree on who is in the trial.
 */
export async function readFreeTrialState(
  client: FreeTrialStateClient,
  organizationId: string,
  now: Date,
  rolloutAt: Date,
): Promise<IFreeTrialState> {
  if (!isFreeTrialEnforced() || !organizationId) {
    return FREE_TRIAL_NOT_APPLICABLE;
  }
  const organization = await client.organization.findFirst({
    select: trialSubjectSelect(organizationId),
    where: { id: organizationId, isDeleted: false },
  });
  if (!organization || isExemptFromTrial(organization)) {
    return FREE_TRIAL_NOT_APPLICABLE;
  }
  const trialEndsAt = resolveFreeTrialEndsAt(organization.createdAt, rolloutAt);
  return {
    isTrialExpired: now.getTime() >= trialEndsAt.getTime(),
    trialEndsAt,
  };
}
