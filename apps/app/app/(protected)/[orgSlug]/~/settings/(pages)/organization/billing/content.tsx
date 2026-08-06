'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { isSelfHostedDeployment } from '@genfeedai/config/deployment';
import { hasOrganizationBillingHint } from '@genfeedai/config/license';
import { ButtonVariant, ByokBillingStatus } from '@genfeedai/enums';
import { getPlanEntitlementForTier } from '@genfeedai/pricing';
import {
  BYOK_FEE_PERCENTAGE,
  BYOK_FREE_THRESHOLD_CREDITS,
} from '@helpers/business/pricing/pricing.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useSubscription } from '@hooks/data/subscription/use-subscription/use-subscription';
import { CreditsService } from '@services/billing/credits.service';
import { EnvironmentService } from '@services/core/environment.service';
import { useQuery } from '@tanstack/react-query';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import { Button } from '@ui/primitives/button';
import { Text } from '@ui/typography/text';
import { ExternalLink, TriangleAlert } from 'lucide-react';

import { ClientFormattedDate } from '@/components/ui/client-formatted-date';
import ManagedCreditsCheckoutCard from '../credits/managed-credits-checkout-card';
import SettingsUsagePage from '../usage/content';
import AddCreditsCard from './add-credits-card';

/** Reusable billing card section */
function BillingCard({
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
    <BillingCard title="BYOK Usage">
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
    </BillingCard>
  );
}

function CreditsCheckoutSection({
  isBillingEnabled,
  openBillingPortal,
}: {
  isBillingEnabled: boolean;
  openBillingPortal: () => void;
}) {
  const hasLocalPaygPrice = Boolean(EnvironmentService.plans.payg);
  const useManagedCloudCheckout =
    isSelfHostedDeployment() && !isBillingEnabled && !hasLocalPaygPrice;

  if (useManagedCloudCheckout) {
    return <ManagedCreditsCheckoutCard />;
  }

  return (
    <AddCreditsCard
      secondaryAction={
        isBillingEnabled ? (
          <Button
            variant={ButtonVariant.SECONDARY}
            onClick={openBillingPortal}
            icon={<ExternalLink className="size-4" />}
          >
            Open Billing Portal
          </Button>
        ) : undefined
      }
    />
  );
}

export default function SettingsBillingPage() {
  const { isReady, settings } = useBrand();
  const {
    subscription,
    creditsBreakdown,
    isLoading,
    isSubscriptionActive,
    openBillingPortal,
  } = useSubscription();

  const isBillingEnabled = hasOrganizationBillingHint();
  const isByokTier =
    subscription?.category?.toLowerCase() === 'byok' || !subscription;
  const remainingPercent = creditsBreakdown
    ? Math.max(
        0,
        Math.min(
          100,
          creditsBreakdown.remainingPercent ??
            (creditsBreakdown.cycleTotal && creditsBreakdown.cycleTotal > 0
              ? (creditsBreakdown.total / creditsBreakdown.cycleTotal) * 100
              : creditsBreakdown.total > 0
                ? 100
                : 0),
        ),
      )
    : null;
  const isLowCredits = (creditsBreakdown?.total ?? 0) < 1000;
  const planEntitlement = getPlanEntitlementForTier(settings?.subscriptionTier);

  if (!isReady || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-form">
        <span className="animate-spin size-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-10">
      <h1 className="sr-only">Billing</h1>

      {isBillingEnabled ? (
        <BillingCard title="Current Plan">
          {subscription ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1">
                  <Text size="sm" color="muted">
                    Plan
                  </Text>
                  <Text weight="medium" className="capitalize">
                    {subscription.category || 'Free'}
                  </Text>
                </div>
                <div className="flex flex-col gap-1 text-right">
                  <Text size="sm" color="muted">
                    Status
                  </Text>
                  <Badge variant={isSubscriptionActive ? 'success' : 'warning'}>
                    {subscription.status}
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
                {formatPlanLimit(planEntitlement.organizationLimit)}
              </Text>
            </div>
            <div className="p-3 bg-muted/50 rounded">
              <Text size="sm" color="muted">
                Brands
              </Text>
              <Text as="p" size="lg" weight="bold">
                {formatPlanLimit(planEntitlement.brandLimit)}
              </Text>
            </div>
            <div className="p-3 bg-muted/50 rounded">
              <Text size="sm" color="muted">
                Channels
              </Text>
              <Text as="p" size="lg" weight="bold">
                {formatPlanLimit(planEntitlement.channelLimit)}
              </Text>
            </div>
            <div className="p-3 bg-muted/50 rounded">
              <Text size="sm" color="muted">
                Seats
              </Text>
              <Text as="p" size="lg" weight="bold">
                {formatPlanLimit(planEntitlement.seatLimit)}
              </Text>
            </div>
            <div className="p-3 bg-muted/50 rounded">
              <Text size="sm" color="muted">
                API
              </Text>
              <Text as="p" size="lg" weight="bold">
                {getApiAccessLabel(planEntitlement)}
              </Text>
            </div>
          </div>
        </BillingCard>
      ) : null}

      {isBillingEnabled && isByokTier ? (
        <ByokUsageSection openBillingPortal={openBillingPortal} />
      ) : null}

      {creditsBreakdown ? (
        <BillingCard title="Credits">
          <div className="flex flex-col gap-3">
            {isLowCredits && (
              <div className="flex items-start gap-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded">
                <TriangleAlert className="size-4 text-amber-500 shrink-0 mt-0.5" />
                <Text size="sm" color="muted">
                  Low credits warning: your organization is below 1,000 credits.
                </Text>
              </div>
            )}
            <div className="flex items-center justify-between p-4 bg-muted/50 rounded">
              <Text size="sm" color="muted">
                Credits Left
              </Text>
              <Text as="span" size="xl" weight="bold">
                {remainingPercent?.toFixed(2) ?? '0.00'}%
              </Text>
            </div>
            <Text size="xs" color="muted">
              Percentage is based on your current credit cycle total
              (subscription + packs purchased in-cycle).
            </Text>
          </div>
        </BillingCard>
      ) : null}

      <CreditsCheckoutSection
        isBillingEnabled={isBillingEnabled}
        openBillingPortal={openBillingPortal}
      />

      <section id="usage" className="scroll-mt-6">
        <SettingsUsagePage />
      </section>
    </div>
  );
}
