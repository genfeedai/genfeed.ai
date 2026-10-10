'use client';

import {
  ButtonVariant,
  ModalEnum,
  QualityTier,
  SubscriptionTier,
} from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { QUALITY_TIER_OPTIONS, TIER_QUALITY_ACCESS } from '@genfeedai/helpers';
import { useOrgUrl } from '@genfeedai/hooks/navigation/use-org-url';
import type { ModalUpgradePromptProps } from '@genfeedai/props/modals/modal-upgrade-prompt.props';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import Modal from '@ui/modals/modal/Modal';
import { Button } from '@ui/primitives/button';
import { ArrowRight, Check, Coins, Lock, Sparkles } from 'lucide-react';
import { useCallback, useState } from 'react';

const TIER_LABELS: Record<SubscriptionTier, string> = {
  [SubscriptionTier.FREE]: 'Free',
  [SubscriptionTier.PRO]: 'Pro',
  [SubscriptionTier.SCALE]: 'Scale',
  [SubscriptionTier.ENTERPRISE]: 'Enterprise',
};

const TIER_PRICES: Record<SubscriptionTier, string> = {
  [SubscriptionTier.FREE]: '$0',
  [SubscriptionTier.PRO]: '$49',
  [SubscriptionTier.SCALE]: '$499',
  [SubscriptionTier.ENTERPRISE]: 'Custom',
};

const TIER_ORDER = [
  SubscriptionTier.FREE,
  SubscriptionTier.PRO,
  SubscriptionTier.SCALE,
  SubscriptionTier.ENTERPRISE,
];

const QUALITY_TIERS_BY_ACCESS: Map<QualityTier, SubscriptionTier> =
  TIER_ORDER.reduce((tiersByQuality, tier) => {
    for (const quality of TIER_QUALITY_ACCESS[tier]) {
      if (!tiersByQuality.has(quality)) {
        tiersByQuality.set(quality, tier);
      }
    }

    return tiersByQuality;
  }, new Map<QualityTier, SubscriptionTier>());

function getRequiredTierForQuality(quality: QualityTier): SubscriptionTier {
  return QUALITY_TIERS_BY_ACCESS.get(quality) ?? SubscriptionTier.SCALE;
}

const UPGRADE_TIERS = [
  {
    highlight: true,
    qualities: [QualityTier.BASIC, QualityTier.STANDARD, QualityTier.HIGH],
    tier: SubscriptionTier.PRO,
  },
  {
    highlight: false,
    qualities: [
      QualityTier.BASIC,
      QualityTier.STANDARD,
      QualityTier.HIGH,
      QualityTier.ULTRA,
    ],
    tier: SubscriptionTier.SCALE,
  },
];

function useAppNavigation() {
  const [isNavigating, setIsNavigating] = useState(false);
  const { orgHref } = useOrgUrl();

  const navigateTo = useCallback(
    (path: string) => {
      setIsNavigating(true);
      const appUrl = EnvironmentService.apps.app;
      window.location.href = `${appUrl}${orgHref(path)}`;
    },
    [orgHref],
  );

  return { isNavigating, navigateTo };
}

/**
 * Shown when the API refuses a credit-spending action (generate, clips,
 * batch, editor renders, agent runs) because the organization has no credits
 * left. Read-only pages stay reachable; this is the only paywall.
 */
function CreditsRequiredPrompt() {
  const { isNavigating, navigateTo } = useAppNavigation();

  return (
    <Modal id={ModalEnum.CREDITS_REQUIRED} title="You're out of credits">
      <div className="space-y-6 py-2">
        <div className="flex items-start gap-3 p-4 bg-primary/5 shadow-border">
          <Coins className="size-5 text-primary flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-foreground">
              Generating needs credits
            </p>
            <p className="text-xs text-foreground/50 mt-1">
              Everything you already made stays in your Library. Buy a credit
              pack or pick a plan to keep creating.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Button
            variant={ButtonVariant.DEFAULT}
            onClick={() => navigateTo(APP_ROUTES.SETTINGS.CREDITS)}
            isDisabled={isNavigating}
            isLoading={isNavigating}
            className="w-full"
          >
            Buy credits
            <ArrowRight className="size-4" />
          </Button>
          <Button
            variant={ButtonVariant.SECONDARY}
            onClick={() => navigateTo(APP_ROUTES.SETTINGS.SUBSCRIPTION)}
            isDisabled={isNavigating}
            className="w-full"
          >
            See plans
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default function ModalUpgradePrompt({
  currentTier = SubscriptionTier.FREE,
  lockedQualityTier,
  reason = 'plan',
}: ModalUpgradePromptProps) {
  if (reason === 'credits') {
    return <CreditsRequiredPrompt />;
  }

  return (
    <PlanUpgradePrompt
      currentTier={currentTier}
      lockedQualityTier={lockedQualityTier}
    />
  );
}

function PlanUpgradePrompt({
  currentTier = SubscriptionTier.FREE,
  lockedQualityTier,
}: ModalUpgradePromptProps) {
  const { isNavigating, navigateTo } = useAppNavigation();

  const requiredTier = lockedQualityTier
    ? getRequiredTierForQuality(lockedQualityTier)
    : SubscriptionTier.PRO;

  const lockedLabel = lockedQualityTier
    ? QUALITY_TIER_OPTIONS.find((o) => o.value === lockedQualityTier)?.label
    : undefined;

  const handleUpgrade = useCallback(() => {
    navigateTo(APP_ROUTES.SETTINGS.SUBSCRIPTION);
  }, [navigateTo]);

  return (
    <Modal id={ModalEnum.UPGRADE_PROMPT} title="Upgrade Your Plan">
      <div className="space-y-6 py-2">
        {/* Lock message */}
        <div className="flex items-start gap-3 p-4 bg-primary/5 shadow-border">
          <Lock className="size-5 text-primary flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-foreground">
              {lockedLabel
                ? `${lockedLabel} quality requires ${TIER_LABELS[requiredTier]} plan`
                : 'This feature requires a higher plan'}
            </p>
            <p className="text-xs text-foreground/50 mt-1">
              You&apos;re on the{' '}
              <span className="font-medium">{TIER_LABELS[currentTier]}</span>{' '}
              plan. Upgrade to unlock more models and higher quality outputs.
            </p>
          </div>
        </div>

        {/* Plan comparison */}
        <div className="grid grid-cols-2 gap-3">
          {UPGRADE_TIERS.map(({ tier, qualities, highlight }) => (
            <div
              key={tier}
              className={`p-4 ${
                highlight
                  ? 'shadow-border-strong bg-primary/5'
                  : 'bg-card shadow-border'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold">
                  {TIER_LABELS[tier]}
                </span>
                {highlight && <Sparkles className="size-4 text-primary" />}
              </div>
              <div className="text-2xl font-bold mb-3">
                {TIER_PRICES[tier]}
                <span className="text-xs font-normal text-foreground/40">
                  /mo
                </span>
              </div>
              <ul className="space-y-1.5">
                {qualities.map((q) => {
                  const label = QUALITY_TIER_OPTIONS.find(
                    (o) => o.value === q,
                  )?.label;
                  return (
                    <li
                      key={q}
                      className="flex items-center gap-2 text-xs text-foreground/60"
                    >
                      <Check className="size-3 text-foreground/30" />
                      {label} quality
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>

        {/* CTA */}
        <Button
          variant={ButtonVariant.DEFAULT}
          onClick={handleUpgrade}
          isDisabled={isNavigating}
          isLoading={isNavigating}
          className="w-full"
        >
          {isNavigating ? (
            'Redirecting…'
          ) : (
            <>
              Upgrade Now
              <ArrowRight className="size-4" />
            </>
          )}
        </Button>
      </div>
    </Modal>
  );
}
