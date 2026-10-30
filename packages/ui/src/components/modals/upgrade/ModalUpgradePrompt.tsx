'use client';

import {
  ButtonVariant,
  ModalEnum,
  type QualityTier,
  SubscriptionTier,
} from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import {
  QUALITY_TIER_OPTIONS,
  resolveSubscriptionTier,
  TIER_QUALITY_ACCESS,
} from '@genfeedai/helpers';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { closeModal } from '@genfeedai/helpers/ui/modal/modal.helper';
import { useOrgUrl } from '@genfeedai/hooks/navigation/use-org-url';
import type { ModalUpgradePromptProps } from '@genfeedai/props/modals/modal-upgrade-prompt.props';
import { EnvironmentService } from '@genfeedai/services/core/environment.service';
import ModalActions from '@ui/modals/actions/ModalActions';
import Modal from '@ui/modals/modal/Modal';
import { Button } from '@ui/primitives/button';
import { ArrowRight, Check, Coins, Minus, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';

const TIER_LABELS: Record<SubscriptionTier, string> = {
  [SubscriptionTier.FREE]: 'Free',
  [SubscriptionTier.SCALE]: 'Scale',
  [SubscriptionTier.ENTERPRISE]: 'Enterprise',
};

const TIER_PRICES: Record<SubscriptionTier, string> = {
  [SubscriptionTier.FREE]: '$0',
  [SubscriptionTier.SCALE]: '$499',
  [SubscriptionTier.ENTERPRISE]: 'Custom',
};

const TIER_ORDER = [
  SubscriptionTier.FREE,
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
 * Shown whenever the API refuses a credit-spending action with
 * `INSUFFICIENT_CREDITS` (generate, clips, batch, editor renders, agent runs).
 * Admission is all-or-nothing, so this is also the answer when some credits
 * are left but not enough for the action. Read-only pages stay reachable.
 */
function CreditsRequiredPrompt() {
  const translate = useTranslations('ui.creditsRequiredPrompt');
  const { isNavigating, navigateTo } = useAppNavigation();

  return (
    <Modal id={ModalEnum.CREDITS_REQUIRED} title={translate('title')}>
      <div className="space-y-6 py-2">
        <div className="flex items-start gap-3 p-4 bg-primary/5 shadow-border">
          <Coins className="size-5 text-primary flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-foreground">
              {translate('heading')}
            </p>
            <p className="text-xs text-foreground/50 mt-1">
              {translate('body')}
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
            {translate('buyCredits')}
            <ArrowRight className="size-4" />
          </Button>
          <Button
            variant={ButtonVariant.SECONDARY}
            onClick={() => navigateTo(APP_ROUTES.SETTINGS.SUBSCRIPTION)}
            isDisabled={isNavigating}
            className="w-full"
          >
            {translate('seePlans')}
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
  currentTier: persistedTier,
  lockedQualityTier,
}: ModalUpgradePromptProps) {
  const currentTier = resolveSubscriptionTier(persistedTier);
  const translate = useTranslations('ui.upgradePrompt');
  const { isNavigating, navigateTo } = useAppNavigation();

  const requiredTier = lockedQualityTier
    ? getRequiredTierForQuality(lockedQualityTier)
    : SubscriptionTier.SCALE;

  const lockedLabel = lockedQualityTier
    ? QUALITY_TIER_OPTIONS.find((o) => o.value === lockedQualityTier)?.label
    : undefined;

  const handleUpgrade = useCallback(() => {
    navigateTo(APP_ROUTES.SETTINGS.SUBSCRIPTION);
  }, [navigateTo]);

  const handleDismiss = useCallback(() => {
    closeModal(ModalEnum.UPGRADE_PROMPT);
  }, []);

  // Already on the required plan (another feature gate): show it alone.
  const plans =
    currentTier === requiredTier
      ? [{ isRecommended: true, tier: requiredTier }]
      : [
          { isRecommended: false, tier: currentTier },
          { isRecommended: true, tier: requiredTier },
        ];

  return (
    <Modal
      id={ModalEnum.UPGRADE_PROMPT}
      size="md"
      title={
        lockedLabel
          ? translate('title', {
              plan: TIER_LABELS[requiredTier],
              quality: lockedLabel,
            })
          : translate('titleFallback')
      }
    >
      <div
        className={cn(
          'grid gap-2',
          plans.length > 1 ? 'grid-cols-2' : 'grid-cols-1',
        )}
      >
        {plans.map(({ isRecommended, tier }) => (
          <div
            key={tier}
            className={cn(
              'flex flex-col gap-3 rounded-lg p-4',
              isRecommended
                ? 'bg-primary/10 shadow-border-strong'
                : 'bg-background-secondary shadow-border',
            )}
          >
            <div>
              <div
                className={cn(
                  'flex items-center gap-1 text-xs',
                  isRecommended ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                {isRecommended ? (
                  <Sparkles aria-hidden="true" className="size-3" />
                ) : null}
                {isRecommended
                  ? translate('recommended')
                  : translate('yourPlan')}
              </div>
              <div className="text-sm font-semibold">{TIER_LABELS[tier]}</div>
              <div className="mt-2 text-2xl font-semibold">
                {TIER_PRICES[tier]}
                {tier === SubscriptionTier.ENTERPRISE ? null : (
                  <span className="text-xs font-normal text-muted-foreground">
                    {translate('perMonth')}
                  </span>
                )}
              </div>
            </div>
            <ul className="flex flex-col gap-2">
              {QUALITY_TIER_OPTIONS.map(({ label, value }) => {
                const hasAccess = TIER_QUALITY_ACCESS[tier].includes(value);
                return (
                  <li
                    key={value}
                    className={cn(
                      'flex items-center gap-2 text-xs',
                      !hasAccess && 'text-muted-foreground',
                    )}
                  >
                    {hasAccess ? (
                      <Check
                        aria-hidden="true"
                        className={cn(
                          'size-3.5',
                          isRecommended && 'text-primary',
                        )}
                      />
                    ) : (
                      <Minus
                        aria-hidden="true"
                        className="size-3.5 opacity-50"
                      />
                    )}
                    {translate('quality', { quality: label })}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      <ModalActions>
        <Button
          onClick={handleDismiss}
          textTransform="none"
          variant={ButtonVariant.GHOST}
        >
          {translate('notNow')}
        </Button>
        <Button
          isDisabled={isNavigating}
          isLoading={isNavigating}
          onClick={handleUpgrade}
          textTransform="none"
          variant={ButtonVariant.DEFAULT}
        >
          {isNavigating ? (
            translate('redirecting')
          ) : (
            <>
              {translate('upgradeTo', { plan: TIER_LABELS[requiredTier] })}
              <ArrowRight aria-hidden="true" className="size-4" />
            </>
          )}
        </Button>
      </ModalActions>
    </Modal>
  );
}
