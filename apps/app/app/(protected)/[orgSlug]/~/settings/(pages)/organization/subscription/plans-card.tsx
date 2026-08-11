'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonVariant } from '@genfeedai/enums';
import type { SubscriptionChangePreview } from '@genfeedai/interfaces';
import {
  formatPlanIncludedCredits,
  formatPlanPriceLabel,
  getPlanByTier,
  type PlanTier,
} from '@genfeedai/pricing';
import { useAuthedService } from '@hooks/auth/use-authed-service/use-authed-service';
import { useSubscription } from '@hooks/data/subscription/use-subscription/use-subscription';
import { StripeService } from '@services/billing/stripe.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import Card from '@ui/card/Card';
import Badge from '@ui/display/badge/Badge';
import { Button } from '@ui/primitives/button';
import { Text } from '@ui/typography/text';
import { Check } from 'lucide-react';
import { useState } from 'react';

/**
 * Only the two self-serve plans are sold in the app. Free/PAYG is never
 * advertised here, and Enterprise is a conversation rather than a checkout
 * button — hence the contact line under the tiles.
 */
const SELLABLE_TIERS: PlanTier[] = ['pro', 'scale'];

/** Features are already ordered strongest-first in the pricing package. */
const FEATURES_SHOWN = 4;

const SALES_EMAIL = 'vincent@genfeed.ai';

function formatCurrencyFromCents(amountInCents: number, currency: string) {
  return new Intl.NumberFormat('en-US', {
    currency: currency.toUpperCase(),
    style: 'currency',
  }).format(Math.abs(amountInCents) / 100);
}

function describeProration(preview: SubscriptionChangePreview): string {
  const currency = preview.upcomingInvoice?.currency || 'usd';
  const amount = formatCurrencyFromCents(preview.prorationAmount, currency);

  if (preview.isUpgrade) {
    return `You'll be charged about ${amount} more per month, prorated for the rest of this period.`;
  }

  if (preview.isDowngrade) {
    return `Your bill goes down by about ${amount} per month. Credit is applied to the next invoice.`;
  }

  return 'This change does not affect your monthly bill.';
}

/**
 * Plan selection for the subscription settings page: Stripe Checkout for an
 * org that has never subscribed, a prorated in-place change for one that has.
 */
export default function PlansCard() {
  const { settings } = useBrand();
  const { subscription, previewPlanChange, changeSubscriptionPlan } =
    useSubscription();

  const [pendingTier, setPendingTier] = useState<PlanTier | null>(null);
  const [preview, setPreview] = useState<SubscriptionChangePreview | null>(
    null,
  );
  const [busyTier, setBusyTier] = useState<PlanTier | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  const getStripeService = useAuthedService((token: string) =>
    StripeService.getInstance(token),
  );

  const currentTier = settings?.subscriptionTier;
  // An org with no Stripe subscription has nothing to prorate against, so it
  // goes through Checkout; the change endpoint would reject it outright.
  const hasStripeSubscription = Boolean(subscription?.stripeSubscriptionId);

  const startCheckout = async (tier: PlanTier, stripePriceId: string) => {
    const service = await getStripeService();
    const result = await service.createCheckoutSession({
      cancelUrl: window.location.href,
      stripePriceId,
      successUrl: `${window.location.origin}${window.location.pathname}?plan=${tier}`,
    });

    if (!result?.url) {
      throw new Error('Checkout session did not return a URL');
    }

    window.location.href = result.url;
  };

  const handleSelectPlan = async (tier: PlanTier) => {
    const { stripePriceId } = getPlanByTier(tier);

    if (!stripePriceId) {
      return;
    }

    setBusyTier(tier);

    try {
      if (!hasStripeSubscription) {
        await startCheckout(tier, stripePriceId);
        return;
      }

      setPreview(await previewPlanChange(stripePriceId));
      setPendingTier(tier);
    } catch (error) {
      logger.error('Failed to start plan change', error);
      NotificationsService.getInstance().error(
        'Could not start the plan change. Please try again.',
      );
    } finally {
      setBusyTier(null);
    }
  };

  const cancelPlanChange = () => {
    setPendingTier(null);
    setPreview(null);
  };

  const handleConfirmPlanChange = async () => {
    if (!pendingTier) {
      return;
    }

    const { stripePriceId } = getPlanByTier(pendingTier);

    if (!stripePriceId) {
      return;
    }

    setIsConfirming(true);

    try {
      await changeSubscriptionPlan(stripePriceId);
      cancelPlanChange();
    } catch (error) {
      logger.error('Failed to change plan', error);
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <Card label="Plans" bodyClassName="gap-4 p-4">
      <div className="grid gap-3 md:grid-cols-2">
        {SELLABLE_TIERS.map((tier) => {
          const plan = getPlanByTier(tier);
          const isCurrentPlan = currentTier === tier;
          const isUnavailable = !plan.stripePriceId;

          return (
            <div
              key={tier}
              className="flex flex-col gap-3 rounded border border-border p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col gap-1">
                  <Text weight="medium">{plan.label}</Text>
                  <Text size="sm" color="muted">
                    {formatPlanIncludedCredits(tier)} / month
                  </Text>
                </div>
                {isCurrentPlan ? (
                  <Badge variant="success">Current</Badge>
                ) : null}
              </div>

              <Text as="p" size="xl" weight="bold">
                {formatPlanPriceLabel(tier)}
              </Text>

              <ul className="flex flex-col gap-1">
                {plan.features.slice(0, FEATURES_SHOWN).map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-success" />
                    <Text size="sm" color="muted">
                      {feature}
                    </Text>
                  </li>
                ))}
              </ul>

              {isCurrentPlan ? null : (
                <Button
                  variant={
                    tier === 'pro'
                      ? ButtonVariant.DEFAULT
                      : ButtonVariant.SECONDARY
                  }
                  isDisabled={isUnavailable || busyTier !== null}
                  isLoading={busyTier === tier}
                  onClick={() => handleSelectPlan(tier)}
                >
                  {hasStripeSubscription
                    ? `Switch to ${plan.label}`
                    : `Upgrade to ${plan.label}`}
                </Button>
              )}

              {isUnavailable ? (
                <Text size="xs" color="muted">
                  This plan is not available in this environment yet.
                </Text>
              ) : null}
            </div>
          );
        })}
      </div>

      {pendingTier && preview ? (
        <div className="flex flex-col gap-3 rounded bg-muted/50 p-4">
          <Text as="p" size="sm" weight="medium">
            Switch to {getPlanByTier(pendingTier).label}?
          </Text>
          <Text as="p" size="sm" color="muted">
            {describeProration(preview)}
          </Text>
          <div className="flex flex-wrap gap-2">
            <Button
              variant={ButtonVariant.DEFAULT}
              isLoading={isConfirming}
              isDisabled={isConfirming}
              onClick={handleConfirmPlanChange}
            >
              Confirm change
            </Button>
            <Button
              variant={ButtonVariant.SECONDARY}
              isDisabled={isConfirming}
              onClick={cancelPlanChange}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      <Text as="p" size="xs" color="muted">
        Need higher limits, custom terms, or an enterprise deployment? Email{' '}
        {SALES_EMAIL}.
      </Text>
    </Card>
  );
}
