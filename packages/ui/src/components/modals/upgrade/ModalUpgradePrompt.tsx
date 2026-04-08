'use client';

import {
  ButtonVariant,
  ModalEnum,
  QualityTier,
  SubscriptionTier,
} from '@genfeedai/enums';
import { QUALITY_TIER_OPTIONS, TIER_QUALITY_ACCESS } from '@genfeedai/helpers';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import { EnvironmentService } from '@services/core/environment.service';
import Modal from '@ui/modals/modal/Modal';
import { Button } from '@ui/primitives/button';
import { useCallback, useState } from 'react';
import {
  HiArrowRight,
  HiCheck,
  HiLockClosed,
  HiSparkles,
} from 'react-icons/hi2';

interface ModalUpgradePromptProps {
  currentTier?: SubscriptionTier;
  lockedQualityTier?: QualityTier;
}

const TIER_LABELS: Record<SubscriptionTier, string> = {
  [SubscriptionTier.FREE]: 'Free',
  [SubscriptionTier.BYOK]: 'BYOK',
  [SubscriptionTier.CREATOR]: 'Creator',
  [SubscriptionTier.PRO]: 'Pro',
  [SubscriptionTier.SCALE]: 'Scale',
  [SubscriptionTier.ENTERPRISE]: 'Enterprise',
};

const TIER_PRICES: Record<SubscriptionTier, string> = {
  [SubscriptionTier.FREE]: '$0',
  [SubscriptionTier.BYOK]: '$0',
  [SubscriptionTier.CREATOR]: '$50',
  [SubscriptionTier.PRO]: '$499',
  [SubscriptionTier.SCALE]: '$1,499',
  [SubscriptionTier.ENTERPRISE]: '$4,999',
};

function getRequiredTierForQuality(quality: QualityTier): SubscriptionTier {
  const tierOrder = [
    SubscriptionTier.FREE,
    SubscriptionTier.CREATOR,
    SubscriptionTier.PRO,
    SubscriptionTier.SCALE,
    SubscriptionTier.ENTERPRISE,
  ];

  for (const tier of tierOrder) {
    const accessibleQualities = TIER_QUALITY_ACCESS[tier];
    if (accessibleQualities?.includes(quality)) {
      return tier;
    }
  }

  return SubscriptionTier.SCALE;
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

export default function ModalUpgradePrompt({
  currentTier = SubscriptionTier.FREE,
  lockedQualityTier,
}: ModalUpgradePromptProps) {
  const [isNavigating, setIsNavigating] = useState(false);
  const { orgHref } = useOrgUrl();

  const requiredTier = lockedQualityTier
    ? getRequiredTierForQuality(lockedQualityTier)
    : SubscriptionTier.PRO;

  const lockedLabel = lockedQualityTier
    ? QUALITY_TIER_OPTIONS.find((o) => o.value === lockedQualityTier)?.label
    : undefined;

  const handleUpgrade = useCallback(() => {
    setIsNavigating(true);
    const appUrl = EnvironmentService.apps.app;
    window.location.href = `${appUrl}${orgHref('/settings/organization/billing')}`;
  }, [orgHref]);

  return (
    <Modal id={ModalEnum.UPGRADE_PROMPT} title="Upgrade Your Plan">
      <div className="space-y-6 py-2">
        {/* Lock message */}
        <div className="flex items-start gap-3 p-4 bg-amber-500/5 border border-amber-500/10">
          <HiLockClosed className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
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
              className={`p-4 border ${
                highlight
                  ? 'border-primary/30 bg-primary/5'
                  : 'border-white/[0.08] bg-white/[0.02]'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold">
                  {TIER_LABELS[tier]}
                </span>
                {highlight && <HiSparkles className="h-4 w-4 text-primary" />}
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
                      <HiCheck className="h-3 w-3 text-foreground/30" />
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
            'Redirecting...'
          ) : (
            <>
              Upgrade Now
              <HiArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </Modal>
  );
}
