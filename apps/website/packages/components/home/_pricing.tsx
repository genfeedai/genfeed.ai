'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import {
  creditPackPrice,
  creditPackTotalCredits,
  WEBSITE_CREDIT_PACKS,
  websitePlans,
} from '@helpers/business/pricing/pricing.helper';
import { cn } from '@helpers/formatting/cn/cn.util';
import { EnvironmentService } from '@services/core/environment.service';
import ButtonTracked from '@ui/buttons/tracked/ButtonTracked';
import { HStack, VStack } from '@ui/layout/stack';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import Link from 'next/link';
import { HiBolt, HiBuildingOffice2, HiCloud } from 'react-icons/hi2';
import { LuArrowRight, LuCheck } from 'react-icons/lu';

const CALENDLY_URL =
  process.env.NEXT_PUBLIC_CALENDLY_URL ||
  'https://calendly.com/vincent-genfeed/30min';

const CREDIT_EXPLAINERS = [
  'Credits buy output: images, reels, ads, articles, voice',
  'Subscriptions include monthly credits at a ~40% better rate',
  'The router always picks the best model — you never pay to experiment',
] as const;

const PLAN_ORDER = ['Pay As You Go', 'Hosted', 'Cloud Teams'] as const;

const PLAN_DISPLAY_NAMES: Record<(typeof PLAN_ORDER)[number], string> = {
  'Cloud Teams': 'Cloud Teams',
  Hosted: 'Creator',
  'Pay As You Go': 'Pay As You Go',
};

function formatPlanPrice(price: number | null): string {
  if (price === null) {
    return 'Custom';
  }

  return `$${price.toLocaleString()}`;
}

function getPlan(label: (typeof PLAN_ORDER)[number]) {
  const plan = websitePlans.find((item) => item.label === label);

  if (!plan) {
    throw new Error(`Missing homepage pricing plan: ${label}`);
  }

  return plan;
}

function getPriceQualifier(label: (typeof PLAN_ORDER)[number]): string {
  const plan = getPlan(label);

  if (plan.type === 'payg') {
    return 'no monthly fee — buy credit packs as you go';
  }

  if (label === 'Cloud Teams') {
    return `/month · 5 seats + ${plan.includedCredits?.toLocaleString()} credits`;
  }

  return `/month · ${plan.includedCredits?.toLocaleString()} credits included`;
}

export default function HomePricing(): React.ReactElement {
  const paygSignUpHref = `${EnvironmentService.apps.app}/sign-up?plan=payg`;
  const creatorSignUpHref = `${EnvironmentService.apps.app}/sign-up?plan=hosted`;

  return (
    <section
      id="pricing"
      className="gen-section-spacing-lg border-b border-edge/5"
    >
      <div className="container mx-auto px-6">
        <div className="mb-12 grid gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(320px,0.55fr)] lg:items-end">
          <VStack className="gap-4">
            <Heading
              as="h2"
              className="max-w-3xl text-4xl font-semibold leading-tight tracking-[-0.03em] sm:text-5xl"
            >
              Pay for output, not access.
            </Heading>
            <Text className="max-w-2xl text-base leading-7 gen-text-muted">
              Signing up is free. Credits buy the content you generate, and a
              subscription only exists to make those credits cheaper — plus more
              brands, channels, and seats.
            </Text>
          </VStack>

          <div className="border border-edge/5 p-5">
            <VStack className="gap-4">
              {CREDIT_EXPLAINERS.map((item) => (
                <HStack key={item} className="items-start gap-3">
                  <LuCheck className="mt-0.5 size-4 shrink-0 text-success" />
                  <Text className="text-sm leading-6 text-surface/60">
                    {item}
                  </Text>
                </HStack>
              ))}
            </VStack>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-px bg-edge/5 lg:grid-cols-3">
          {PLAN_ORDER.map((label) => {
            const plan = getPlan(label);
            const isPayg = plan.type === 'payg';
            const isCreator = label === 'Hosted';
            const isTeamCloud = label === 'Cloud Teams';
            const ctaHref = isPayg
              ? paygSignUpHref
              : isCreator
                ? creatorSignUpHref
                : plan.ctaHref || CALENDLY_URL;

            return (
              <div
                key={plan.label}
                className={cn(
                  'flex flex-col gap-5 bg-background p-6',
                  isCreator && 'bg-white/[0.04]',
                )}
              >
                <VStack className="gap-2">
                  <HStack
                    className={cn(
                      'items-center gap-2 text-xs font-bold uppercase tracking-widest',
                      isCreator ? 'text-surface/60' : 'text-surface/35',
                    )}
                  >
                    {isTeamCloud ? (
                      <HiBuildingOffice2 className="size-4" />
                    ) : isPayg ? (
                      <HiBolt className="size-4" />
                    ) : (
                      <HiCloud className="size-4" />
                    )}
                    <Text>{PLAN_DISPLAY_NAMES[label]}</Text>
                  </HStack>

                  <Heading as="h3" className="text-3xl font-black text-surface">
                    {formatPlanPrice(plan.price)}
                  </Heading>
                  <Text className="text-xs leading-5 text-surface/45">
                    {getPriceQualifier(label)}
                  </Text>
                </VStack>

                <Text className="text-sm leading-6 text-surface/55">
                  {plan.valueProposition || plan.description}
                </Text>

                <div className="h-px bg-edge/5" />

                <ul className="flex-1 space-y-2">
                  {plan.features.slice(0, 4).map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <LuCheck className="mt-0.5 size-3.5 shrink-0 text-surface/30" />
                      <Text className="text-xs leading-5 text-surface/50">
                        {feature}
                      </Text>
                    </li>
                  ))}
                </ul>

                <ButtonTracked
                  asChild
                  className="w-full justify-center"
                  size={ButtonSize.PUBLIC}
                  trackingData={{ plan: plan.label.toLowerCase() }}
                  trackingName="pricing_plan_click"
                  variant={ButtonVariant.OUTLINE}
                >
                  <a href={ctaHref} rel="noopener noreferrer" target="_blank">
                    {plan.cta}
                    <LuArrowRight className="size-3" />
                  </a>
                </ButtonTracked>
              </div>
            );
          })}
        </div>

        <div className="mt-px grid grid-cols-1 gap-px bg-edge/5 sm:grid-cols-3">
          {WEBSITE_CREDIT_PACKS.map((pack) => (
            <div
              key={pack.label}
              className="flex items-baseline justify-between gap-4 bg-background px-6 py-4"
            >
              <Text className="text-xs font-bold uppercase tracking-widest text-surface/35">
                {pack.label} pack
              </Text>
              <Text className="text-sm text-surface/60">
                ${creditPackPrice(pack).toLocaleString()} →{' '}
                {creditPackTotalCredits(pack).toLocaleString()} credits
                {pack.bonus ? (
                  <span className="text-success">
                    {' '}
                    (+{pack.bonus.toLocaleString()} bonus)
                  </span>
                ) : null}
              </Text>
            </div>
          ))}
        </div>

        <HStack className="mt-10 flex-wrap items-center justify-center gap-4">
          <ButtonTracked
            asChild
            size={ButtonSize.PUBLIC}
            trackingName="pricing_view_full_click"
            variant={ButtonVariant.OUTLINE}
          >
            <Link href="/pricing">
              Compare Plans
              <LuArrowRight className="size-3" />
            </Link>
          </ButtonTracked>
          <ButtonTracked
            asChild
            size={ButtonSize.PUBLIC}
            trackingData={{ action: 'book_demo_pricing' }}
            trackingName="pricing_demo_click"
            variant={ButtonVariant.OUTLINE}
          >
            <a href={CALENDLY_URL} rel="noopener noreferrer" target="_blank">
              Book a Demo
            </a>
          </ButtonTracked>
        </HStack>
      </div>
    </section>
  );
}
