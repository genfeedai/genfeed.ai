'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonVariant, formatEnumLabel } from '@genfeedai/contracts';
import { getPlanEntitlementForTier, getPlanLabel } from '@genfeedai/pricing';
import { useBillingAccount } from '@hooks/data/billing/use-billing-account/use-billing-account';
import { useSubscription } from '@hooks/data/subscription/use-subscription/use-subscription';
import type { SubscriptionStatCellProps } from '@props/settings/subscription-page.props';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import { SkeletonCard } from '@ui/display/skeleton/skeleton';
import { Button } from '@ui/primitives/button';
import { Text } from '@ui/typography/text';
import { ExternalLink } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { ClientFormattedDate } from '@/components/ui/client-formatted-date';
import PlansCard from './plans-card';

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

function formatSubscriptionTierLabel(tier?: string): string {
  return (tier && SUBSCRIPTION_TIER_LABELS[tier]) || 'Free';
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
  const translate = useTranslations('common');
  const { isReady, settings } = useBrand();
  const { subscription, isLoading, isSubscriptionActive, openBillingPortal } =
    useSubscription();
  const { account: billingAccount } = useBillingAccount();

  const isPlanLoading = !isReady || isLoading;
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
        ) : subscription ? (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex items-center gap-3">
              <Text as="p" size="xl" weight="bold">
                {formatSubscriptionTierLabel(settings?.subscriptionTier)}
              </Text>
              <Badge variant={isSubscriptionActive ? 'success' : 'warning'}>
                {formatEnumLabel(subscription.status)}
              </Badge>
            </div>
            {subscription.currentPeriodEnd && (
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

      <PlansCard />
    </div>
  );
}
