'use client';

import { isSelfHostedDeployment } from '@genfeedai/config/deployment';
import { hasOrganizationBillingHint } from '@genfeedai/config/license';
import { useSubscription } from '@hooks/data/subscription/use-subscription/use-subscription';
import { EnvironmentService } from '@services/core/environment.service';
import Card from '@ui/card/Card';
import { SkeletonCard } from '@ui/display/skeleton/skeleton';
import { Alert, AlertDescription } from '@ui/primitives/alert';
import { Text } from '@ui/typography/text';
import { TriangleAlert } from 'lucide-react';
import AddCreditsCard from '../billing/add-credits-card';
import ManagedCreditsCheckoutCard from './managed-credits-checkout-card';
import ReferralHubCard from './referral-hub-card';

/**
 * Credits surface: balance + top-up.
 * - Org Stripe PAYG when SaaS/EE or a local PAYG price is configured.
 * - Managed Genfeed Cloud checkout only for community self-host without PAYG.
 */
export default function SettingsCreditsPage() {
  const { creditsBreakdown, isLoading } = useSubscription();
  const isBillingEnabled = hasOrganizationBillingHint();
  const hasLocalPaygPrice = Boolean(EnvironmentService.plans.payg);
  const useManagedCloudCheckout =
    isSelfHostedDeployment() && !isBillingEnabled && !hasLocalPaygPrice;

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

  return (
    <div className="flex flex-col gap-4 pb-10">
      <h1 className="sr-only">Credits</h1>

      {isLoading ? (
        <Card
          label="Balance"
          bodyClassName="gap-3 p-4"
          data-testid="credits-balance-loading"
        >
          <SkeletonCard showImage={false} />
        </Card>
      ) : creditsBreakdown ? (
        <Card label="Balance" bodyClassName="gap-3 p-4">
          <div className="flex flex-col gap-3">
            {isLowCredits && (
              <Alert variant="warning">
                <TriangleAlert aria-hidden="true" className="size-4" />
                <AlertDescription>
                  Low credits warning: your organization is below 1,000 credits.
                </AlertDescription>
              </Alert>
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
        </Card>
      ) : null}

      {useManagedCloudCheckout ? (
        <ManagedCreditsCheckoutCard />
      ) : (
        <AddCreditsCard />
      )}

      {isBillingEnabled && !useManagedCloudCheckout ? (
        <ReferralHubCard />
      ) : null}
    </div>
  );
}
