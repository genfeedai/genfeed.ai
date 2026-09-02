'use client';

import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonVariant } from '@genfeedai/contracts';
import type { SubscriptionChangePreview } from '@genfeedai/contracts/interfaces';
import {
  formatPlanIncludedCredits,
  formatPlanLaunchPriceLabel,
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
import { useTranslations } from 'next-intl';
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

/**
 * The proration message key that applies, plus the amount it interpolates.
 * Returned rather than translated here so the catalog lookup stays in the
 * component, where the `useTranslations` binding lives.
 */
function describeProration(preview: SubscriptionChangePreview) {
  if (!preview.upcomingInvoice) {
    return { amount: '', key: 'subscription.plans.prorationUnavailable' };
  }

  const amount = formatCurrencyFromCents(
    preview.upcomingInvoice.amount_due,
    preview.upcomingInvoice.currency,
  );

  if (preview.isUpgrade) {
    return { amount, key: 'subscription.plans.prorationUpgrade' };
  }

  if (preview.isDowngrade) {
    return { amount, key: 'subscription.plans.prorationDowngrade' };
  }

  return { amount, key: 'subscription.plans.prorationNoChange' };
}

/**
 * Plan selection for the subscription settings page: Stripe Checkout for an
 * org that has never subscribed, a prorated in-place change for one that has.
 */
export default function PlansCard() {
  const translate = useTranslations('common');
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
      // Subscriptions bill one seat of a fixed price; quantity is for credit packs.
      quantity: null,
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
        translate('subscription.plans.changeError'),
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

  const proration = preview ? describeProration(preview) : null;

  return (
    <Card label="Plans" bodyClassName="gap-4 p-4">
      <div className="grid gap-3 md:grid-cols-2">
        {SELLABLE_TIERS.map((tier) => {
          const plan = getPlanByTier(tier);
          const isCurrentPlan = currentTier === tier;
          const isUnavailable = !plan.stripePriceId;
          const launchPriceLabel = formatPlanLaunchPriceLabel(tier);

          return (
            <div
              key={tier}
              className="flex flex-col gap-3 rounded border border-border p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col gap-1">
                  <Text weight="medium">{plan.label}</Text>
                  <Text size="sm" color="muted">
                    {translate('subscription.plans.creditsPerMonth', {
                      credits: formatPlanIncludedCredits(tier),
                    })}
                  </Text>
                </div>
                {isCurrentPlan ? (
                  <Badge variant="success">
                    {translate('subscription.plans.current')}
                  </Badge>
                ) : null}
              </div>

              <div className="flex flex-col gap-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <Text as="p" size="xl" weight="bold">
                    {launchPriceLabel ?? formatPlanPriceLabel(tier)}
                  </Text>
                  {launchPriceLabel ? (
                    <Text size="sm" color="muted" className="line-through">
                      {translate('subscription.plans.listPrice', {
                        price: formatPlanPriceLabel(tier),
                      })}
                    </Text>
                  ) : null}
                </div>
                {launchPriceLabel && plan.launchNote ? (
                  <Text size="xs" color="muted">
                    {plan.launchNote}
                  </Text>
                ) : null}
              </div>

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
                    ? translate('subscription.plans.switchTo', {
                        plan: plan.label,
                      })
                    : translate('subscription.plans.upgradeTo', {
                        plan: plan.label,
                      })}
                </Button>
              )}

              {isUnavailable ? (
                <Text size="xs" color="muted">
                  {translate('subscription.plans.unavailable')}
                </Text>
              ) : null}
            </div>
          );
        })}
      </div>

      {pendingTier && proration ? (
        <div className="flex flex-col gap-3 rounded bg-muted/50 p-4">
          <Text as="p" size="sm" weight="medium">
            {translate('subscription.plans.confirmTitle', {
              plan: getPlanByTier(pendingTier).label,
            })}
          </Text>
          <Text as="p" size="sm" color="muted">
            {translate(proration.key, { amount: proration.amount })}
          </Text>
          <div className="flex flex-wrap gap-2">
            <Button
              variant={ButtonVariant.DEFAULT}
              isLoading={isConfirming}
              isDisabled={isConfirming}
              onClick={handleConfirmPlanChange}
            >
              {translate('subscription.plans.confirmChange')}
            </Button>
            <Button
              variant={ButtonVariant.SECONDARY}
              isDisabled={isConfirming}
              onClick={cancelPlanChange}
            >
              {translate('actions.cancel')}
            </Button>
          </div>
        </div>
      ) : null}

      <Text as="p" size="xs" color="muted">
        {translate('subscription.plans.salesContact', { email: SALES_EMAIL })}
      </Text>
    </Card>
  );
}
