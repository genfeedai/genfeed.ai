'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import {
  ButtonVariant,
  ByokBillingStatus,
  formatEnumLabel,
} from '@genfeedai/enums';
import {
  BYOK_FEE_PERCENTAGE,
  BYOK_FREE_THRESHOLD_CREDITS,
  getPlanEntitlementForTier,
  getPlanLabel,
} from '@genfeedai/pricing';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useBillingAccount } from '@hooks/data/billing/use-billing-account/use-billing-account';
import { useSubscription } from '@hooks/data/subscription/use-subscription/use-subscription';
import { CreditsService } from '@services/billing/credits.service';
import { useQuery } from '@tanstack/react-query';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import { SkeletonCard } from '@ui/display/skeleton/skeleton';
import { Button } from '@ui/primitives/button';
import { Text } from '@ui/typography/text';
import { ExternalLink, TriangleAlert } from 'lucide-react';

import { ClientFormattedDate } from '@/components/ui/client-formatted-date';
import PlansCard from './plans-card';

/**
 * `subscription.category` is not serialized to the client, so the plan name is
 * read from the organization's entitlement tier — the same value that drives
 * the limits grid below it.
 */
const SUBSCRIPTION_TIER_LABELS: Record<string, string> = {
  byok: 'BYOK',
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
  return limit === null ? 'Unlimited' : limit.toLocaleString();
}

function getApiAccessLabel(
  entitlement: ReturnType<typeof getPlanEntitlementForTier>,
): string {
  if (!entitlement.apiAccess) {
    return 'Paid plans';
  }

  return entitlement.apiRateLimit === null ? 'Custom' : 'Included';
}

function ByokUsageSection({
  openBillingPortal,
}: {
  openBillingPortal: () => void;
}) {
  const getCreditsService = useAuthedService((token: string) =>
    CreditsService.getInstance(token),
  );

  const { data: byokUsage, isLoading } = useQuery({
    queryKey: ['byok-usage-summary'],
    queryFn: async () => {
      const service = await getCreditsService();
      return service.getByokUsageSummary();
    },
  });

  if (isLoading || !byokUsage) {
    return null;
  }

  const isPastDue = byokUsage.billingStatus === ByokBillingStatus.PAST_DUE;
  const isSuspended = byokUsage.billingStatus === ByokBillingStatus.SUSPENDED;

  return (
    <SectionCard title="BYOK Usage">
      <div className="flex flex-col gap-4">
        {(isPastDue || isSuspended) && (
          <div className="flex items-start gap-3 p-4 bg-destructive/10 border border-destructive/20 rounded">
            <TriangleAlert className="size-5 text-destructive shrink-0 mt-0.5" />
            <div className="flex flex-col gap-2">
              <Text size="sm" weight="medium" color="destructive">
                {isPastDue
                  ? 'Payment failed — BYOK access may be suspended'
                  : 'BYOK access suspended due to unpaid invoice'}
              </Text>
              <Button
                variant={ButtonVariant.DEFAULT}
                onClick={openBillingPortal}
              >
                Update Payment Method
              </Button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 bg-muted/50 rounded">
            <Text size="sm" color="muted">
              Credits Used This Period
            </Text>
            <Text as="p" size="xl" weight="bold">
              {byokUsage.totalUsage.toLocaleString()}
            </Text>
          </div>
          <div className="p-4 bg-muted/50 rounded">
            <Text size="sm" color="muted">
              Free Allowance Remaining
            </Text>
            <Text as="p" size="xl" weight="bold">
              {byokUsage.freeRemaining.toLocaleString()}
              <Text as="span" size="sm" color="muted">
                {' '}
                / {BYOK_FREE_THRESHOLD_CREDITS.toLocaleString()}
              </Text>
            </Text>
          </div>
        </div>

        {byokUsage.billableUsage > 0 && (
          <div className="flex items-center justify-between p-4 border border-border rounded">
            <div className="flex flex-col gap-1">
              <Text size="sm" color="muted">
                Estimated Fee This Period
              </Text>
              <Text size="xs" color="muted">
                {BYOK_FEE_PERCENTAGE}% platform fee on{' '}
                {byokUsage.billableUsage.toLocaleString()} billable credits
              </Text>
            </div>
            <Text size="lg" weight="bold">
              ${byokUsage.projectedFee.toFixed(2)}
            </Text>
          </div>
        )}

        <Text size="xs" color="muted">
          First {BYOK_FREE_THRESHOLD_CREDITS.toLocaleString()} credits/month are
          free. A {BYOK_FEE_PERCENTAGE}% platform fee applies after the free
          tier. Invoiced on the 1st of each month.
        </Text>
      </div>
    </SectionCard>
  );
}

/** Plan, entitlements, Stripe portal — not credit top-ups. */
export default function SettingsSubscriptionPage() {
  const { isReady, settings } = useBrand();
  const { subscription, isLoading, isSubscriptionActive, openBillingPortal } =
    useSubscription();
  const { account: billingAccount } = useBillingAccount();

  const isPlanLoading = !isReady || isLoading;
  const isByokTier =
    !isPlanLoading &&
    (subscription?.category?.toLowerCase() === 'byok' || !subscription);
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

        <div className="grid grid-cols-2 gap-3 border-t border-border pt-4 md:grid-cols-5">
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
                  {billingAccount.wallet.available.toLocaleString()}
                </Text>
              </div>
              <div className="p-3 bg-muted/50 rounded">
                <Text size="sm" color="muted">
                  Held
                </Text>
                <Text as="p" size="lg" weight="bold">
                  {billingAccount.wallet.held.toLocaleString()}
                </Text>
              </div>
              <div className="p-3 bg-muted/50 rounded">
                <Text size="sm" color="muted">
                  Settled
                </Text>
                <Text as="p" size="lg" weight="bold">
                  {billingAccount.wallet.settled.toLocaleString()}
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
                    {link.usage.toLocaleString()} used
                  </Text>
                </div>
              ))}
            </div>
          </div>
        </SectionCard>
      ) : null}

      <PlansCard />

      {isByokTier ? (
        <ByokUsageSection openBillingPortal={openBillingPortal} />
      ) : null}

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
