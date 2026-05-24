'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { websitePlans } from '@helpers/business/pricing/pricing.helper';
import { cn } from '@helpers/formatting/cn/cn.util';
import { EnvironmentService } from '@services/core/environment.service';
import ButtonTracked from '@ui/buttons/tracked/ButtonTracked';
import { HStack, VStack } from '@ui/layout/stack';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import Link from 'next/link';
import { HiCloud, HiCurrencyDollar, HiServerStack } from 'react-icons/hi2';
import { LuArrowRight, LuCheck } from 'react-icons/lu';

const CALENDLY_URL =
  process.env.NEXT_PUBLIC_CALENDLY_URL ||
  'https://calendly.com/vincent-genfeed/30min';

const PAYG_EXPLAINERS = [
  'No bundled output quota to decode',
  'Videos, images, and voice are usage-based',
  'Premium models are managed by Genfeed',
] as const;

const PLAN_ORDER = ['Hosted', 'Cloud Teams', 'Enterprise'] as const;

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

export default function HomePricing(): React.ReactElement {
  const signUpHref = `${EnvironmentService.apps.app}/sign-up?plan=hosted`;

  return (
    <section
      id="pricing"
      className="gen-section-spacing-lg border-b border-edge/5"
    >
      <div className="container mx-auto px-6">
        <div className="mb-12 grid gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(320px,0.55fr)] lg:items-end">
          <VStack className="gap-4">
            <HStack className="items-center gap-3">
              <HiCurrencyDollar className="size-4 gen-icon" />
              <Text className="gen-label gen-text-accent">Pricing</Text>
            </HStack>
            <Heading
              as="h2"
              className="max-w-3xl text-4xl font-serif tracking-normal sm:text-5xl"
            >
              Pay for access. Then pay for what you create.
            </Heading>
            <Text className="max-w-2xl text-base leading-7 gen-text-muted">
              The website now sells the cloud app first. Self-hosting stays
              available, but the default path is managed: sign up, create, and
              let usage scale with output.
            </Text>
          </VStack>

          <div className="border border-edge/5 p-5">
            <VStack className="gap-4">
              {PAYG_EXPLAINERS.map((item) => (
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
            const isCloudApp = plan.label === 'Hosted';
            const isTeamCloud = plan.label === 'Cloud Teams';
            const priceQualifier =
              plan.type === 'payg'
                ? '/month platform access + PAYG output'
                : plan.price === null
                  ? 'Custom pricing'
                  : '/month + PAYG output';
            const ctaHref = isCloudApp
              ? signUpHref
              : plan.ctaHref || CALENDLY_URL;
            const ctaLabel = isCloudApp ? 'Start Cloud App' : plan.cta;

            return (
              <div
                key={plan.label}
                className={cn(
                  'flex flex-col gap-5 bg-background p-6',
                  isCloudApp && 'bg-white/[0.04]',
                )}
              >
                <VStack className="gap-2">
                  <HStack
                    className={cn(
                      'items-center gap-2 text-xs font-bold uppercase tracking-widest',
                      isCloudApp ? 'text-surface/60' : 'text-surface/35',
                    )}
                  >
                    {isTeamCloud ? (
                      <HiServerStack className="size-4" />
                    ) : (
                      <HiCloud className="size-4" />
                    )}
                    <Text>{isCloudApp ? 'Cloud App' : plan.label}</Text>
                  </HStack>

                  <Heading as="h3" className="text-3xl font-black text-surface">
                    {formatPlanPrice(plan.price)}
                  </Heading>
                  <Text className="text-xs leading-5 text-surface/45">
                    {priceQualifier}
                  </Text>
                </VStack>

                <Text className="text-sm leading-6 text-surface/55">
                  {isCloudApp
                    ? 'Managed Genfeed for founders and creators who want the app without operating infrastructure.'
                    : plan.valueProposition || plan.description}
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
                    {ctaLabel}
                    <LuArrowRight className="size-3" />
                  </a>
                </ButtonTracked>
              </div>
            );
          })}
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
