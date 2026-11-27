'use client';

import { resolveOnboardingExitHref } from '@app/(onboarding)/onboarding/(wizard)/_expert/use-complete-onboarding.hook';
import { useBrand } from '@contexts/user/brand-context/brand-context';
import { ButtonVariant } from '@genfeedai/contracts';
import {
  formatPlanIncludedCredits,
  formatPrice,
  getLaunchPrice,
  getLaunchPriceTerm,
  getPlanByTier,
  PAYG_CREDITS_PER_USD,
  PAYG_MIN_PURCHASE_USD,
} from '@genfeedai/pricing';
import {
  AccessStateProvider,
  useAccessState,
} from '@providers/access-state/access-state.provider';
import { EnvironmentService } from '@services/core/environment.service';
import { logger } from '@services/core/logger.service';
import { NotificationsService } from '@services/core/notifications.service';
import { Button } from '@ui/primitives/button';
import { OptionTile, OptionTileGroup } from '@ui/primitives/option-tile';
import Spinner from '@ui/primitives/spinner';
import { Text } from '@ui/typography/text';
import { CreditCard } from 'lucide-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useStartCheckout } from '@/hooks/data/subscription/use-start-checkout/use-start-checkout';

type PlanChoice = 'pro' | 'scale' | 'credits';

const SKILLS_REPOSITORY_URL = 'https://github.com/genfeedai/skills';
/** The smallest credit pack: what "Credits only" starts with. */
const STARTER_PACK_CREDITS = PAYG_MIN_PURCHASE_USD * PAYG_CREDITS_PER_USD;

function formatCount(value: number): string {
  return value.toLocaleString('en-US');
}

/**
 * The plan and credits choice an organization that never paid lands on after
 * the onboarding. Cloud has no free tier: the onboarding drafts stay saved and
 * readable, and publishing starts with the first payment, a plan or a credit
 * pack. The API refuses an unpaid publish on its own, so this page is where
 * the way out is shown, not the gate.
 */
export default function PlansContent() {
  return (
    <AccessStateProvider>
      <PlanChoiceScreen />
    </AccessStateProvider>
  );
}

function PlanChoiceScreen() {
  const translate = useTranslations('pages.onboarding.plans');
  const { accessState, isLoading, isSuperAdmin } = useAccessState();
  const { brands, selectedBrand } = useBrand();
  const openCheckout = useStartCheckout();
  const [choice, setChoice] = useState<PlanChoice>('pro');
  const [isStartingCheckout, setIsStartingCheckout] = useState(false);

  const draftsHref = resolveOnboardingExitHref(
    selectedBrand ?? brands[0],
    true,
  );

  if (isLoading || !accessState) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner className="size-6 text-foreground" />
      </div>
    );
  }

  // Paid, comped or a platform admin: nothing to choose here.
  if (accessState.trialEndsAt == null || isSuperAdmin) {
    return (
      <div className="mx-auto flex max-w-lg flex-col gap-4 pt-12">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">
          {translate('paidTitle')}
        </h1>
        <Text as="p" color="muted">
          {translate('paidBody')}
        </Text>
        <div>
          <Button asChild variant={ButtonVariant.DEFAULT}>
            <Link href={draftsHref}>{translate('openWorkspace')}</Link>
          </Button>
        </div>
      </div>
    );
  }

  const pro = getPlanByTier('pro');
  const scale = getPlanByTier('scale');
  const proLaunchPrice = getLaunchPrice('pro');
  const proLaunchTerm = getLaunchPriceTerm('pro');
  const paygPriceId = EnvironmentService.plans.payg;

  const options: Array<{
    description: string;
    isUnavailable: boolean;
    price: string;
    title: string;
    value: PlanChoice;
  }> = [
    {
      description: [
        translate('planCredits', {
          credits: formatPlanIncludedCredits('pro'),
          target: pro.target ?? '',
        }),
        proLaunchTerm,
      ]
        .filter(Boolean)
        .join(' '),
      isUnavailable: !pro.stripePriceId,
      price: translate('perMonth', {
        price: formatPrice(proLaunchPrice ?? pro.price),
      }),
      title: pro.label,
      value: 'pro',
    },
    {
      description: translate('planCredits', {
        credits: formatPlanIncludedCredits('scale'),
        target: scale.target ?? '',
      }),
      isUnavailable: !scale.stripePriceId,
      price: translate('perMonth', { price: formatPrice(scale.price) }),
      title: scale.label,
      value: 'scale',
    },
    {
      description: translate('creditsDescription', {
        credits: formatCount(STARTER_PACK_CREDITS),
      }),
      isUnavailable: !paygPriceId,
      price: translate('creditsPrice', {
        price: formatPrice(PAYG_MIN_PURCHASE_USD),
      }),
      title: translate('creditsTitle'),
      value: 'credits',
    },
  ];
  const selected =
    options.find((option) => option.value === choice) ?? options[0];

  const handleContinue = async () => {
    const stripePriceId =
      choice === 'credits' ? paygPriceId : getPlanByTier(choice).stripePriceId;
    if (!stripePriceId) {
      NotificationsService.getInstance().error(translate('unavailable'));
      return;
    }

    setIsStartingCheckout(true);
    try {
      await openCheckout({
        // A plan bills one seat of a fixed price; a pack is its credits.
        quantity: choice === 'credits' ? STARTER_PACK_CREDITS : null,
        stripePriceId,
        successUrl: `${window.location.origin}${draftsHref}`,
      });
    } catch (error) {
      logger.error('Failed to start checkout after onboarding', error);
      NotificationsService.getInstance().error(translate('checkoutFailed'));
      setIsStartingCheckout(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-8 pt-6">
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl text-balance">
          {translate('title')}
        </h1>
        <Text as="p" color="muted">
          {translate('body')}
        </Text>
      </div>

      <OptionTileGroup<PlanChoice>
        ariaLabel={translate('choiceLabel')}
        onValueChange={setChoice}
        testId="onboarding-plan-choice"
        value={choice}
      >
        {options.map((option) => (
          <OptionTile
            description={
              option.isUnavailable
                ? translate('unavailable')
                : option.description
            }
            isUnavailable={option.isUnavailable}
            key={option.value}
            testId={`onboarding-plan-${option.value}`}
            title={option.title}
            trailing={
              <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                {option.price}
              </span>
            }
            value={option.value}
          />
        ))}
      </OptionTileGroup>

      <div className="flex flex-col gap-3">
        <Button
          className="w-full sm:w-fit"
          icon={<CreditCard className="size-4" />}
          isDisabled={selected.isUnavailable || isStartingCheckout}
          isLoading={isStartingCheckout}
          onClick={() => void handleContinue()}
          variant={ButtonVariant.DEFAULT}
        >
          {translate('continue', { plan: selected.title })}
        </Button>
        <Text as="p" size="xs" color="muted">
          {translate('stripeNote')}
        </Text>
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-6 text-sm text-muted-foreground">
        <p>
          {translate('draftsPrompt')}{' '}
          <Link
            className="text-foreground underline underline-offset-4"
            href={draftsHref}
          >
            {translate('draftsLink')}
          </Link>
        </p>
        <p>
          {translate('doneForYouPrompt')}{' '}
          <a
            className="text-foreground underline underline-offset-4"
            href={`${EnvironmentService.apps.website}/done-for-you#book`}
          >
            {translate('doneForYouLink')}
          </a>
        </p>
        <p>
          {translate('skillsPrompt')}{' '}
          <a
            className="text-foreground underline underline-offset-4"
            href={SKILLS_REPOSITORY_URL}
            rel="noreferrer"
            target="_blank"
          >
            {translate('skillsLink')}
          </a>
        </p>
      </div>
    </div>
  );
}
