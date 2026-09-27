'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonVariant, formatEnumLabel } from '@genfeedai/contracts';
import { getPlanEntitlementForTier, getPlanLabel } from '@genfeedai/pricing';
import { useBillingAccount } from '@hooks/data/billing/use-billing-account/use-billing-account';
import { useSubscription } from '@hooks/data/subscription/use-subscription/use-subscription';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import { SkeletonCard } from '@ui/display/skeleton/skeleton';
import { Button } from '@ui/primitives/button';
import { Text } from '@ui/typography/text';
import { ExternalLink } from 'lucide-react';

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

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card label={title} bodyClassName="gap-3 p-4">
      {children}
    </Card>
  );
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

/** Plan, entitlements, Stripe portal — not credit top-ups. */
export default function SettingsSubscriptionPage() {
  const { isReady, settings } = useBrand();
  const { subscription, isLoading, isSubscriptionActive, openBillingPortal } =
    useSubscription();
  const { account: billingAccount } = useBillingAccount();

  const isPlanLoading = !isReady || isLoading;
  const planEntitlement = getPlanEntitlementForTier(settings?.subscriptionTier);

  return (
    <div className="flex flex-col gap-4 pb-10">
      <h1 className="sr-only">Subscription</h1>

      <SectionCard title="Current Plan">
        {isPlanLoading ? (
          <SkeletonCard showImage={false} />
        ) : subscription ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-1">
                <Text size="sm" color="muted">
                  Plan
                </Text>
                <Text weight="medium">
                  {formatSubscriptionTierLabel(settings?.subscriptionTier)}
                </Text>
              </div>
              <div className="flex flex-col gap-1 text-right">
                <Text size="sm" color="muted">
                  Status
                </Text>
                <Badge variant={isSubscriptionActive ? 'success' : 'warning'}>
                  {formatEnumLabel(subscription.status)}
                </Badge>
              </div>
            </div>
            {subscription.currentPeriodEnd && (
              <div>
                <Text as="p" size="sm" color="muted">
                  Current period ends
                </Text>
                <Text as="p" weight="medium">
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
                </Text>
              </div>
            )}
          </div>
        ) : (
          <Text color="muted">
            No active subscription. Subscribe to unlock all features.
          </Text>
        )}

        <div className="grid grid-cols-2 gap-3 border-t border-border pt-4 md:grid-cols-6">
          <div className="p-3 bg-muted/50 rounded">
            <Text size="sm" color="muted">
              Organizations
            </Text>
            <Text as="p" size="lg" weight="bold">
              {isReady
                ? formatPlanLimit(planEntitlement.organizationLimit)
                : '-'}
            </Text>
          </div>
          <div className="p-3 bg-muted/50 rounded">
            <Text size="sm" color="muted">
              Brands
            </Text>
            <Text as="p" size="lg" weight="bold">
              {isReady ? formatPlanLimit(planEntitlement.brandLimit) : '-'}
            </Text>
          </div>
          <div className="p-3 bg-muted/50 rounded">
            <Text size="sm" color="muted">
              Channels
            </Text>
            <Text as="p" size="lg" weight="bold">
              {isReady ? formatPlanLimit(planEntitlement.channelLimit) : '-'}
            </Text>
          </div>
          <div className="p-3 bg-muted/50 rounded">
            <Text size="sm" color="muted">
              Seats
            </Text>
            <Text as="p" size="lg" weight="bold">
              {isReady ? formatPlanLimit(planEntitlement.seatLimit) : '-'}
            </Text>
          </div>
          <div className="p-3 bg-muted/50 rounded">
            <Text size="sm" color="muted">
              API
            </Text>
            <Text as="p" size="lg" weight="bold">
              {isReady ? getApiAccessLabel(planEntitlement) : '-'}
            </Text>
          </div>
          <div className="p-3 bg-muted/50 rounded">
            <Text size="sm" color="muted">
              Bring your own keys
            </Text>
            <Text as="p" size="lg" weight="bold">
              {isReady
                ? planEntitlement.byokAccess
                  ? 'Included'
                  : 'Paid plans'
                : '-'}
            </Text>
          </div>
        </div>
      </SectionCard>

      {billingAccount ? (
        <SectionCard title="Billing account">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <Text size="sm" color="muted">
                Status
              </Text>
              <Badge
                variant={billingAccount.isIdentityStale ? 'warning' : 'success'}
              >
                {formatEnumLabel(billingAccount.status)}
              </Badge>
            </div>
            {billingAccount.isIdentityStale ? (
              <Text size="sm" color="destructive">
                Billing identity is stale. Checkout is blocked until the mapping
                is repaired.
              </Text>
            ) : null}
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 bg-muted/50 rounded">
                <Text size="sm" color="muted">
                  Available
                </Text>
                <Text as="p" size="lg" weight="bold">
                  {billingAccount.wallet.available.toLocaleString('en-US')}
                </Text>
              </div>
              <div className="p-3 bg-muted/50 rounded">
                <Text size="sm" color="muted">
                  Held
                </Text>
                <Text as="p" size="lg" weight="bold">
                  {billingAccount.wallet.held.toLocaleString('en-US')}
                </Text>
              </div>
              <div className="p-3 bg-muted/50 rounded">
                <Text size="sm" color="muted">
                  Settled
                </Text>
                <Text as="p" size="lg" weight="bold">
                  {billingAccount.wallet.settled.toLocaleString('en-US')}
                </Text>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Text size="sm" color="muted">
                Funded organizations
              </Text>
              {billingAccount.linkedOrganizations.map((link) => (
                <div
                  className="flex items-center justify-between"
                  key={link.organizationId}
                >
                  <Text weight="medium">{link.label}</Text>
                  <Text size="sm" color="muted">
                    {link.usage.toLocaleString('en-US')} used
                  </Text>
                </div>
              ))}
            </div>
          </div>
        </SectionCard>
      ) : null}

      <PlansCard />

      <SectionCard title="Manage subscription">
        <Text as="p" size="sm" color="muted">
          View invoices, update payment methods, and manage your plan through
          the Stripe billing portal.
        </Text>
        <Button
          variant={ButtonVariant.DEFAULT}
          onClick={openBillingPortal}
          disabled={billingAccount?.capabilities.canOpenPortal === false}
          icon={<ExternalLink className="size-4" />}
        >
          Open Billing Portal
        </Button>
      </SectionCard>
    </div>
  );
}
