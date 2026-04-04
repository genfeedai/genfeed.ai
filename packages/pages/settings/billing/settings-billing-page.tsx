'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonVariant, ByokBillingStatus } from '@genfeedai/enums';
import {
  BYOK_FEE_PERCENTAGE,
  BYOK_FREE_THRESHOLD_CREDITS,
} from '@helpers/business/pricing/pricing.helper';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useResource } from '@hooks/data/resource/use-resource/use-resource';
import { useSubscription } from '@hooks/data/subscription/use-subscription/use-subscription';
import { CreditsService } from '@services/billing/credits.service';
import Button from '@ui/buttons/base/Button';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import { VStack } from '@ui/layout/stack';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import {
  HiArrowTopRightOnSquare,
  HiExclamationTriangle,
} from 'react-icons/hi2';

/** Reusable billing card section */
function BillingCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-6">
      <VStack gap={4}>
        <Heading size="lg">{title}</Heading>
        {children}
      </VStack>
    </Card>
  );
}

function ByokUsageSection({
  openBillingPortal,
}: {
  openBillingPortal: () => void;
}) {
  const getCreditsService = useAuthedService((token: string) =>
    CreditsService.getInstance(token),
  );

  const { data: byokUsage, isLoading } = useResource(
    async () => {
      const service = await getCreditsService();
      return service.getByokUsageSummary();
    },
    { dependencies: [] },
  );

  if (isLoading || !byokUsage) {
    return null;
  }

  const isPastDue = byokUsage.billingStatus === ByokBillingStatus.PAST_DUE;
  const isSuspended = byokUsage.billingStatus === ByokBillingStatus.SUSPENDED;

  return (
    <BillingCard title="BYOK Usage">
      <VStack gap={4}>
        {(isPastDue || isSuspended) && (
          <div className="flex items-start gap-3 p-4 bg-destructive/10 border border-destructive/20 rounded">
            <HiExclamationTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <VStack gap={2}>
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
            </VStack>
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
            <VStack gap={1}>
              <Text size="sm" color="muted">
                Estimated Fee This Period
              </Text>
              <Text size="xs" color="muted">
                {BYOK_FEE_PERCENTAGE}% platform fee on{' '}
                {byokUsage.billableUsage.toLocaleString()} billable credits
              </Text>
            </VStack>
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
      </VStack>
    </BillingCard>
  );
}

export default function SettingsBillingPage() {
  const { isReady } = useBrand();
  const {
    subscription,
    creditsBreakdown,
    isLoading,
    isSubscriptionActive,
    openBillingPortal,
  } = useSubscription();

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

  if (!isReady || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-form">
        <span className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <VStack gap={6}>
      <BillingCard title="Current Plan">
        {subscription ? (
          <VStack gap={4}>
            <div className="flex items-center justify-between">
              <VStack gap={1}>
                <Text size="sm" color="muted">
                  Plan
                </Text>
                <Text weight="medium" className="capitalize">
                  {subscription.category || 'Free'}
                </Text>
              </VStack>
              <VStack gap={1} className="text-right">
                <Text size="sm" color="muted">
                  Status
                </Text>
                <Badge variant={isSubscriptionActive ? 'success' : 'warning'}>
                  {subscription.status}
                </Badge>
              </VStack>
            </div>
            {subscription.currentPeriodEnd && (
              <div>
                <Text as="p" size="sm" color="muted">
                  Current period ends
                </Text>
                <Text as="p" weight="medium">
                  {new Date(subscription.currentPeriodEnd).toLocaleDateString(
                    'en-US',
                    {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    },
                  )}
                </Text>
              </div>
            )}
          </VStack>
        ) : (
          <Text color="muted">
            No active subscription. Subscribe to unlock all features.
          </Text>
        )}
      </BillingCard>

      {isByokTier && <ByokUsageSection openBillingPortal={openBillingPortal} />}

      <BillingCard title="Credits">
        {creditsBreakdown ? (
          <VStack gap={4}>
            <div className="flex items-center justify-between p-4 bg-muted/50">
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
            {isLowCredits && (
              <div className="flex items-start gap-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded">
                <HiExclamationTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <Text size="sm" color="muted">
                  Low credits warning: your organization is below 1,000 credits.
                </Text>
              </div>
            )}
          </VStack>
        ) : (
          <Text color="muted">No credits information available.</Text>
        )}
      </BillingCard>

      <BillingCard title="Manage Billing">
        <Text as="p" size="sm" color="muted">
          View invoices, update payment methods, and manage your subscription
          through the Stripe billing portal.
        </Text>
        <Button variant={ButtonVariant.DEFAULT} onClick={openBillingPortal}>
          <HiArrowTopRightOnSquare className="mr-2 h-4 w-4" />
          Open Billing Portal
        </Button>
      </BillingCard>
    </VStack>
  );
}
