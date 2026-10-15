import { BOOKING_HREF } from '@data/booking.data';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { ONBOARDING_STARTER_CREDITS } from '@genfeedai/contracts/types';
import type { PlanTier } from '@genfeedai/pricing';
import {
  AVATAR_CREDIT_COSTS,
  CREDIT_VALUE_DOLLARS,
  creditPackPrice,
  creditPackTotalCredits,
  formatPrice,
  getPlanByTier,
  getPlanLabel,
  INTERNAL_CREDIT_COSTS,
  PLAN_COPY,
  VIDEO_CREDIT_COSTS,
  WEBSITE_CREDIT_PACKS,
  type websitePlans,
} from '@genfeedai/pricing';
import { cn } from '@helpers/formatting/cn/cn.util';
import { formatNumberWithCommas } from '@helpers/formatting/format/format.helper';
import { EnvironmentService } from '@services/core/environment.service';
import SectionHeader from '@ui/marketing/SectionHeader';
import { Button } from '@ui/primitives/button';
import AgentFirstActions from '@web-components/buttons/agent-first-actions/AgentFirstActions';
import FaqGrid from '@web-components/content/FaqGrid';
import {
  CtaSection,
  NeuralGrid,
  NeuralGridItem,
  WebSection,
} from '@web-components/content/NeuralGrid';
import { serviceOffering } from '@web-components/landing/service-offering.data';
import MarketingEntrance from '@web-components/MarketingEntrance';
import PageLayout from '@web-components/PageLayout';
import ProofTestimonials from '@web-components/proof/ProofTestimonials';
import { CircleCheck } from 'lucide-react';
import Link from 'next/link';

/** Column order on the pricing table. Names resolve from @genfeedai/pricing. */
const PLAN_ORDER: PlanTier[] = ['payg', 'scale'];
const FEATURED_TIER: PlanTier = 'scale';

const FAQ_ITEMS = [
  {
    answer: `You get ${ONBOARDING_STARTER_CREDITS} free credits when you finish onboarding.`,
    question: 'Is there a free trial?',
  },
  {
    answer:
      'One credit is $0.01. You see the price of every job before it runs.',
    question: 'How do credits work?',
  },
  {
    answer: 'No. Genfeed picks the best model for every job.',
    question: 'Do I choose the AI model?',
  },
  {
    answer: `Yes, on ${PLAN_COPY.scale.name}.`,
    question: 'Is there an API?',
  },
];

interface OutputCostRow {
  credits: number;
  /** Upper bound when the output's price depends on how it is rendered. */
  maxCredits?: number;
  label: string;
  suffix?: string;
}

const OUTPUT_COSTS: OutputCostRow[] = [
  { credits: INTERNAL_CREDIT_COSTS.image, label: 'Image (1K/2K)' },
  { credits: INTERNAL_CREDIT_COSTS.image4k, label: 'Image (4K)' },
  { credits: VIDEO_CREDIT_COSTS.video8s, label: 'Short video (8s)' },
  {
    credits: AVATAR_CREDIT_COSTS.avatar4s.minCredits,
    label: 'Avatar clip (4s)',
    maxCredits: AVATAR_CREDIT_COSTS.avatar4s.maxCredits,
  },
  {
    credits: INTERNAL_CREDIT_COSTS.voicePerMinute,
    label: 'Voiceover',
    suffix: '/min',
  },
  {
    credits: INTERNAL_CREDIT_COSTS.articlePerPost,
    label: 'Article / SEO post',
  },
];

function formatCredits(credits: number, maxCredits?: number): string {
  return maxCredits === undefined
    ? `${formatNumberWithCommas(credits)} credits`
    : `${formatNumberWithCommas(credits)}–${formatNumberWithCommas(maxCredits)} credits`;
}

function formatCreditsDollars(credits: number, maxCredits?: number): string {
  const dollars = (value: number) =>
    `$${(value * CREDIT_VALUE_DOLLARS).toFixed(2)}`;
  return maxCredits === undefined
    ? dollars(credits)
    : `${dollars(credits)}–${dollars(maxCredits)}`;
}

function getOrderedPlans() {
  return PLAN_ORDER.map((tier) => getPlanByTier(tier));
}

/**
 * The single line under the price. It says one thing only: how many credits the
 * plan gives you. Everything else about the plan (seats, organizations, API) is
 * a bullet, so this line stays scannable and never duplicates the feature list.
 */
export function getPriceQualifier(plan: (typeof websitePlans)[number]): string {
  if (plan.type === 'payg') {
    return 'No monthly fee';
  }

  if (plan.type === 'subscription') {
    if (plan.includedCredits == null) {
      return 'Monthly subscription';
    }

    return `${formatNumberWithCommas(plan.includedCredits)} credits included`;
  }

  return 'Custom credit terms';
}

export default function PricingContent() {
  const paygSignUpHref = `${EnvironmentService.apps.app}/sign-up?plan=payg`;

  return (
    <MarketingEntrance hero={false} sections={false}>
      <PageLayout compact title="Pricing">
        <WebSection maxWidth="full" py="sm" className="pt-0 md:pt-0">
          <NeuralGrid columns={3} className="gsap-grid md:grid-cols-3">
            {getOrderedPlans().map((plan, index) => {
              const isFeatured = plan.tier === FEATURED_TIER;
              const isPayg = plan.type === 'payg';
              const ctaHref = isPayg
                ? paygSignUpHref
                : plan.ctaHref || BOOKING_HREF;

              return (
                <NeuralGridItem
                  key={plan.tier}
                  padding="lg"
                  className={cn(
                    'relative gsap-card flex min-w-0 flex-col p-6 sm:p-6',
                    isFeatured && 'bg-card hover:bg-card',
                  )}
                  tierLabel={`${String(index + 1).padStart(2, '0')} / ${isPayg ? 'PAYG' : getPlanLabel(plan.tier)}`}
                  aria-label={getPlanLabel(plan.tier)}
                >
                  {isFeatured ? (
                    <div className="absolute right-6 top-6">
                      <span className="border border-edge/40 px-2.5 py-1 text-2xs font-bold uppercase tracking-widest text-surface/70">
                        Popular
                      </span>
                    </div>
                  ) : null}

                  <div className="mb-2 flex items-baseline gap-1.5 whitespace-nowrap">
                    <span className="text-4xl font-semibold tracking-[-0.03em] xl:text-5xl">
                      {isPayg
                        ? `$${CREDIT_VALUE_DOLLARS.toFixed(2)}`
                        : formatPrice(plan.launchPrice ?? plan.price)}
                    </span>
                    <span className="text-sm font-medium text-surface/55">
                      {isPayg ? '/credit' : '/mo'}
                    </span>
                  </div>

                  <div className="mb-6 text-sm text-surface/60">
                    {getPriceQualifier(plan)}
                    {isPayg
                      ? ` · ${ONBOARDING_STARTER_CREDITS} free credits after onboarding`
                      : null}
                  </div>

                  <ul className="mb-auto space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3">
                        <CircleCheck className="mt-0.5 size-4 shrink-0 text-surface/55" />
                        <span className="text-sm text-surface/60">
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <Button
                    asChild
                    className="mt-8 w-full justify-center"
                    size={ButtonSize.PUBLIC}
                    variant={
                      isFeatured
                        ? ButtonVariant.DEFAULT
                        : ButtonVariant.SECONDARY
                    }
                  >
                    <a href={ctaHref} target="_blank" rel="noopener noreferrer">
                      {plan.cta || 'Get Started'}
                    </a>
                  </Button>
                </NeuralGridItem>
              );
            })}

            <NeuralGridItem
              padding="lg"
              className="relative gsap-card flex min-w-0 flex-col p-6 sm:p-6"
              tierLabel={`03 / ${serviceOffering.name}`}
              aria-label={serviceOffering.name}
            >
              <div className="absolute right-6 top-6">
                <span className="border border-edge/20 px-2.5 py-1 text-2xs font-bold uppercase tracking-widest text-surface/65">
                  We run it
                </span>
              </div>

              <div className="mb-2 flex items-baseline gap-1.5 whitespace-nowrap">
                <span className="text-4xl font-semibold tracking-[-0.03em] xl:text-5xl">
                  {formatPrice(serviceOffering.startingMonthlyPrice)}
                </span>
                <span className="text-sm font-medium text-surface/55">/mo</span>
              </div>

              <div className="mb-6 text-sm text-surface/60">
                {serviceOffering.priceNote}
              </div>

              <ul className="mb-auto space-y-3">
                {serviceOffering.includes.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <CircleCheck className="mt-0.5 size-4 shrink-0 text-surface/55" />
                    <span className="text-sm text-surface/60">{feature}</span>
                  </li>
                ))}
              </ul>

              <Button
                asChild
                className="mt-8 w-full justify-center"
                size={ButtonSize.PUBLIC}
                variant={ButtonVariant.SECONDARY}
              >
                <Link href={BOOKING_HREF}>{serviceOffering.cta}</Link>
              </Button>
            </NeuralGridItem>
          </NeuralGrid>
        </WebSection>

        <ProofTestimonials context="pricing" />

        <WebSection maxWidth="lg" py="md">
          <SectionHeader
            title="What output costs."
            className="[&_h2]:text-4xl sm:[&_h2]:text-5xl mb-4"
          />

          <div className="grid gap-px bg-edge/5 sm:grid-cols-2 lg:grid-cols-3">
            {OUTPUT_COSTS.map((row) => (
              <div
                key={row.label}
                className="flex items-baseline justify-between gap-4 bg-background px-5 py-4"
              >
                <span className="text-sm text-surface/65">{row.label}</span>
                <span className="text-sm font-semibold text-surface">
                  {formatCredits(row.credits, row.maxCredits)}
                  <span className="ml-2 font-normal text-surface/55">
                    ≈ {formatCreditsDollars(row.credits, row.maxCredits)}
                    {row.suffix ?? ''}
                  </span>
                </span>
              </div>
            ))}
          </div>

          <p className="mt-8 mb-2 text-sm font-medium text-surface/70">
            Top up from $10.
          </p>
          <div className="grid gap-px bg-edge/5 sm:grid-cols-3">
            {WEBSITE_CREDIT_PACKS.map((pack) => (
              <div
                key={pack.label}
                className="flex items-baseline justify-between gap-4 bg-background px-5 py-4"
              >
                <span className="text-sm font-semibold text-surface">
                  ${formatNumberWithCommas(creditPackPrice(pack))}
                </span>
                <span className="text-sm text-surface/60">
                  {formatNumberWithCommas(creditPackTotalCredits(pack))} credits
                </span>
              </div>
            ))}
          </div>
        </WebSection>

        <WebSection bg="bordered" maxWidth="md">
          <SectionHeader
            title="Questions"
            className="[&_h2]:text-4xl sm:[&_h2]:text-5xl"
          />

          <FaqGrid items={FAQ_ITEMS} />
        </WebSection>

        <CtaSection bg="subtle" title="Start free.">
          <AgentFirstActions
            signUpHref={paygSignUpHref}
            trackingName="pricing_cta_click"
          />
        </CtaSection>
      </PageLayout>
    </MarketingEntrance>
  );
}
