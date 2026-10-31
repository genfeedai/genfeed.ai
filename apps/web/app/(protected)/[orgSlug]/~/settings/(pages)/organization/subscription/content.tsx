'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  ButtonVariant,
  formatEnumLabel,
  SubscriptionStatus,
  SubscriptionTier,
} from '@genfeedai/contracts';
import {
  getPlanEntitlementForTier,
  getPlanLabel,
  type PlanTier,
} from '@genfeedai/pricing';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import { SkeletonCard } from '@ui/display/skeleton/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@ui/primitives/alert';
import { Button } from '@ui/primitives/button';
import { Text } from '@ui/typography/text';
import { ExternalLink } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ClientFormattedDate } from '@/components/ui/client-formatted-date';
import { useBillingAccount } from '@/features/settings/hooks/use-billing-account/use-billing-account';
import type { SubscriptionStatCellProps } from '@/features/settings/props/subscription-page.props';
import { useSubscription } from '@/hooks/data/subscription/use-subscription/use-subscription';
import { useDesktopRuntimeContext } from '@/hooks/ui/use-desktop-runtime-context/use-desktop-runtime-context';
import UpgradePlan from './upgrade-plan';

/**
 * `subscription.category` is not serialized to the client, so the plan name is
 * read from the organization's entitlement tier — the same value that drives
 * the limits grid below it.
 */
const SUBSCRIPTION_TIER_LABELS: Record<string, string> = {
  enterprise: getPlanLabel('enterprise'),
  free: 'Free',
  payg: getPlanLabel('payg'),
  pro: getPlanLabel('pro'),
  scale: getPlanLabel('scale'),
};

function formatSubscriptionTierLabel(tier?: string | null): string {
  const normalizedTier = tier?.trim().toLowerCase();

  return (normalizedTier && SUBSCRIPTION_TIER_LABELS[normalizedTier]) || 'Free';
}

function formatPlanLimit(limit: number | null): string {
  return limit === null ? 'Unlimited' : limit.toLocaleString('en-US');
}

function getApiAccessLabel(
  entitlement: ReturnType<typeof getPlanEntitlementForTier>,
): string {
  if (!entitlement.apiAccess) {
    return 'Paid plans';
  }

  return entitlement.apiRateLimit === null ? 'Custom' : 'Included';
}

function formatCredits(value: number): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: 1 });
}

function StatCell({ label, value }: SubscriptionStatCellProps) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Text as="p" size="xs" color="muted">
        {label}
      </Text>
      <Text as="p" weight="semibold" className="truncate tabular-nums">
        {value}
      </Text>
    </div>
  );
}

/** Plan, entitlements, Stripe portal — not credit top-ups. */
export default function SettingsSubscriptionPage() {
  const runtime = useDesktopRuntimeContext();
  const translate = useTranslations('common.subscription');
  const isSubscriptionAvailable =
    runtime.status === 'web' ||
    (runtime.status === 'ready' && runtime.context?.runtimeMode === 'cloud');

  if (!isSubscriptionAvailable) {
    return (
      <div className="flex flex-col gap-4 pb-10">
        <h1 className="sr-only">{translate('title')}</h1>
        <Alert>
          <AlertTitle>{translate('unavailableTitle')}</AlertTitle>
          <AlertDescription>
            {translate('unavailableDescription')}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return <SettingsSubscriptionContent />;
}

function SettingsSubscriptionContent() {
  const translate = useTranslations('common');
  const { isReady, settings } = useBrand();
  const { subscription, isLoading, isSubscriptionActive, openBillingPortal } =
    useSubscription();
  const { account: billingAccount } = useBillingAccount();

  const isPlanLoading = !isReady || isLoading;
  // Provisioning creates an INCOMPLETE row before Stripe checkout. Free is
  // usable without checkout; an actual Stripe subscription keeps its status.
  // A tier the page cannot map (stale casing, legacy value) is shown and
  // entitled as Free, so it must also read as Free here.
  const isFreePlanActive =
    formatSubscriptionTierLabel(settings?.subscriptionTier) ===
      SUBSCRIPTION_TIER_LABELS[SubscriptionTier.FREE] &&
    !subscription?.stripeSubscriptionId &&
    (!subscription || subscription.status === SubscriptionStatus.INCOMPLETE);
  const tierLabel = formatSubscriptionTierLabel(settings?.subscriptionTier);
  // Free and pay-as-you-go have no recurring period, and only Scale is sold,
  // so the upgrade offer and the renewal date follow the same split.
  const isBelowPro =
    tierLabel === SUBSCRIPTION_TIER_LABELS[SubscriptionTier.FREE] ||
    tierLabel === SUBSCRIPTION_TIER_LABELS.payg;
  const isPro = tierLabel === SUBSCRIPTION_TIER_LABELS[SubscriptionTier.PRO];
  const isBelowScale = isBelowPro || isPro;
  // Free offers both subscriptions; Pro only offers the step up to Scale.
  const upgradeTiers: PlanTier[] = isBelowPro ? ['pro', 'scale'] : ['scale'];
  const displayedStatus = isFreePlanActive
    ? SubscriptionStatus.ACTIVE
    : subscription?.status;
  const planEntitlement = getPlanEntitlementForTier(settings?.subscriptionTier);
  const limits = [
    {
      label: 'Organizations',
      value: formatPlanLimit(planEntitlement.organizationLimit),
    },
    { label: 'Brands', value: formatPlanLimit(planEntitlement.brandLimit) },
    { label: 'Channels', value: formatPlanLimit(planEntitlement.channelLimit) },
    { label: 'Seats', value: formatPlanLimit(planEntitlement.seatLimit) },
    { label: 'API', value: getApiAccessLabel(planEntitlement) },
    {
      label: 'Bring your own keys',
      value: planEntitlement.byokAccess ? 'Included' : 'Paid plans',
    },
  ];

  return (
    <div className="flex flex-col gap-4 pb-10">
      <h1 className="sr-only">Subscription</h1>

      <Card
        label="Current Plan"
        bodyClassName="gap-5 p-5"
        headerAction={
          <Button
            variant={ButtonVariant.DEFAULT}
            onClick={openBillingPortal}
            disabled={billingAccount?.capabilities.canOpenPortal === false}
            icon={<ExternalLink className="size-4" />}
          >
            Open Billing Portal
          </Button>
        }
      >
        {isPlanLoading ? (
          <SkeletonCard showImage={false} />
        ) : displayedStatus ? (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex items-center gap-3">
              <Text as="p" size="xl" weight="bold">
                {tierLabel}
              </Text>
              <Badge
                variant={
                  isFreePlanActive || isSubscriptionActive
                    ? 'success'
                    : 'warning'
                }
              >
                {formatEnumLabel(displayedStatus)}
              </Badge>
            </div>
            {!isBelowPro && subscription?.currentPeriodEnd && (
              <Text as="p" size="sm" color="muted">
                Current period ends{' '}
                <span className="font-medium text-foreground">
                  <ClientFormattedDate
                    format="date"
                    locales="en-US"
                    options={{
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    }}
                    value={subscription.currentPeriodEnd}
                  />
                </span>
              </Text>
            )}
          </div>
        ) : (
          <Text as="p" color="muted">
            No active subscription. Subscribe to unlock all features.
          </Text>
        )}

        <div className="grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-3 lg:grid-cols-6">
          {limits.map((limit) => (
            <StatCell
              key={limit.label}
              label={limit.label}
              value={isReady ? limit.value : '-'}
            />
          ))}
        </div>

        {isBelowScale && !isPlanLoading ? (
          <UpgradePlan tiers={upgradeTiers} />
        ) : null}

        {billingAccount?.kind === 'account' ? (
          <div className="flex flex-col gap-4 border-t border-border pt-4">
            <div className="flex items-center justify-between gap-3">
              <Text as="p" size="sm" weight="semibold">
                Billing account
              </Text>
              <Badge
                variant={billingAccount.isIdentityStale ? 'warning' : 'success'}
              >
                {formatEnumLabel(billingAccount.status)}
              </Badge>
            </div>
            {billingAccount.isIdentityStale ? (
              <Text as="p" size="sm" color="destructive">
                Billing identity is stale. Checkout is blocked until the mapping
                is repaired.
              </Text>
            ) : null}
            <div className="grid grid-cols-3 gap-4">
              <StatCell
                label="Available"
                value={formatCredits(billingAccount.wallet.available)}
              />
              <StatCell
                label="Held"
                value={formatCredits(billingAccount.wallet.held)}
              />
              <StatCell
                label="Settled"
                value={formatCredits(billingAccount.wallet.settled)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Text as="p" size="xs" color="muted">
                Funded organizations
              </Text>
              {billingAccount.linkedOrganizations.map((link) => (
                <div
                  className="flex items-center justify-between gap-3"
                  key={link.organizationId}
                >
                  <Text as="p" size="sm" weight="medium">
                    {link.label}
                  </Text>
                  <Text as="p" size="sm" color="muted" className="tabular-nums">
                    {formatCredits(link.usage)} used
                  </Text>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {billingAccount?.kind === 'organization' ? (
          <div className="flex flex-col gap-3 border-t border-border pt-4">
            <div className="flex items-center justify-between gap-3">
              <Text as="p" size="sm" weight="semibold">
                {translate('subscription.billingAccount.title')}
              </Text>
              <Badge variant={billingAccount.isLinked ? 'success' : 'warning'}>
                {billingAccount.isLinked
                  ? translate('subscription.billingAccount.linked')
                  : translate('subscription.billingAccount.notLinked')}
              </Badge>
            </div>
            <Text as="p" size="sm" color="muted">
              {translate('subscription.billingAccount.linkedHeading')}
            </Text>
            <Text as="p" size="sm" color="muted">
              {translate('subscription.billingAccount.sharedDescription')}
            </Text>
            <div className="grid grid-cols-2 gap-4">
              <StatCell
                label={translate('subscription.billingAccount.usageLabel')}
                value={formatCredits(billingAccount.usage)}
              />
              {billingAccount.monthlyBudgetCredits !== null ? (
                <StatCell
                  label={translate(
                    'subscription.billingAccount.monthlyBudgetLabel',
                  )}
                  value={formatCredits(billingAccount.monthlyBudgetCredits)}
                />
              ) : null}
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
