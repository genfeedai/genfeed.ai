'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import type { PlanTier } from '@genfeedai/pricing';
import {
  AVATAR_CREDIT_COSTS,
  BYOK_CREDIT_VALUE_DOLLARS,
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
import { useMarketingEntrance } from '@hooks/ui/use-marketing-entrance';
import { EnvironmentService } from '@services/core/environment.service';
import SectionHeader from '@ui/marketing/SectionHeader';
import { Button } from '@ui/primitives/button';
import FaqGrid from '@web-components/content/FaqGrid';
import {
  CtaSection,
  NeuralGrid,
  NeuralGridItem,
  WebSection,
} from '@web-components/content/NeuralGrid';
import PageLayout from '@web-components/PageLayout';
import ProofTestimonials from '@web-components/proof/ProofTestimonials';
import { CircleCheck } from 'lucide-react';

/** Column order on the pricing table. Names resolve from @genfeedai/pricing. */
const PLAN_ORDER: PlanTier[] = ['payg', 'pro', 'scale'];
const FEATURED_TIER: PlanTier = 'pro';

const FAQ_ITEMS = [
  {
    answer:
      'Signing up is free. Credits buy the output you generate: images, reels, ads, articles, avatar clips, and voice. Subscriptions exist to make credits cheaper, unlock API access, and support shared team seats.',
    question: 'How does pricing work?',
  },
  {
    answer:
      'One credit is one cent at the pay-as-you-go rate. An image is 50 credits ($0.50), an 8-second reel is 600 credits ($6.00), a voiceover is 17 credits per minute, and an article is 25 credits. You see the cost of every job before you run it.',
    question: 'What does output cost?',
  },
  {
    answer:
      'No. Genfeed routes every job to the best model for the format, brief, and budget, so you never pick a model, manage keys, or pay to experiment across providers.',
    question: 'Do I need to choose AI models?',
  },
  {
    answer: `${PLAN_COPY.pro.nameWithPrice} includes ${PLAN_COPY.pro.includedCredits} (about ${PLAN_COPY.pro.includedCreditsValue} of pay-as-you-go output), unlimited brand kits, unlimited connected channels, and API access. ${PLAN_COPY.scale.nameWithPrice} includes unlimited seats, ${PLAN_COPY.scale.includedCredits} in a shared pool, multi-organization control, and approvals.`,
    question: 'What do subscriptions add?',
  },
  {
    answer: `Brands and connected channels are unlimited. ${PLAN_COPY.payg.name} and ${PLAN_COPY.pro.name} include one organization; ${PLAN_COPY.scale.name} and ${PLAN_COPY.enterprise.name} add multi-organization workflows.`,
    question: 'How many brands and channels can I connect?',
  },
  {
    answer: `Yes. API access is included on every paid plan at the same credit price. Generate in the studio or via code, and it draws from the same credit balance. ${PLAN_COPY.pro.name} gets standard rate limits, ${PLAN_COPY.scale.name} higher limits, and ${PLAN_COPY.enterprise.name} custom limits with an SLA.`,
    question: 'Is there an API?',
  },
  {
    answer: `Yes. Start on ${PLAN_COPY.payg.name} with no monthly fee, then move to ${PLAN_COPY.pro.name} when included credits make your monthly output cheaper. ${PLAN_COPY.scale.name} is for shared seats, budgets, and higher-volume team workflows.`,
    question: 'Can I start free and upgrade later?',
  },
  {
    answer:
      'Book a demo when you need team rollout planning, migration support, enterprise terms, or a multi-brand workflow designed before signup.',
    question: 'When should I book a demo?',
  },
];

const PRICING_RULES = [
  'Free to sign up',
  'Credits buy every format',
  'Subscriptions make credits cheaper',
  'Unlimited seats and shared pools for teams',
] as const;

interface OutputCostRow {
  credits: number;
  label: string;
  suffix?: string;
}

const OUTPUT_COSTS: OutputCostRow[] = [
  { credits: INTERNAL_CREDIT_COSTS.image, label: 'Image (1K/2K)' },
  { credits: INTERNAL_CREDIT_COSTS.image4k, label: 'Image (4K)' },
  { credits: VIDEO_CREDIT_COSTS.video8s, label: 'Short video (8s)' },
  { credits: AVATAR_CREDIT_COSTS.avatar4s, label: 'Avatar clip (4s)' },
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

function formatCredits(credits: number): string {
  return `${formatNumberWithCommas(credits)} credits`;
}

function formatCreditsDollars(credits: number): string {
  return `$${(credits * BYOK_CREDIT_VALUE_DOLLARS).toFixed(2)}`;
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
    return `Credits at $${BYOK_CREDIT_VALUE_DOLLARS.toFixed(2)} each`;
  }

  if (plan.type === 'subscription') {
    if (plan.includedCredits == null) {
      return 'Monthly subscription';
    }

    return `${formatNumberWithCommas(plan.includedCredits)} credits included`;
  }

  return 'Custom credit terms';
}

function getPlanSummary(plan: (typeof websitePlans)[number]): string {
  return plan.valueProposition || plan.description;
}

export default function PricingContent() {
  const containerRef = useMarketingEntrance({ hero: false, sections: false });
  const paygSignUpHref = `${EnvironmentService.apps.app}/sign-up?plan=payg`;
  const proSignUpHref = `${EnvironmentService.apps.app}/sign-up?plan=pro`;
  const enterprisePlan = getPlanByTier('enterprise');

  return (
    <div ref={containerRef}>
      <PageLayout
        title={<>Credits for output. Subscriptions for scale.</>}
        description="Signing up is free. Credits buy the content you generate; a subscription makes those credits cheaper and unlocks API access plus shared team seats."
      >
        <WebSection maxWidth="lg" py="md">
          <div className="grid gap-px bg-edge/5 md:grid-cols-4">
            {PRICING_RULES.map((rule) => (
              <div key={rule} className="bg-background px-5 py-4">
                <div className="flex items-center gap-2 text-sm text-surface/65">
                  <CircleCheck className="size-4 text-success" />
                  {rule}
                </div>
              </div>
            ))}
          </div>
        </WebSection>

        <WebSection maxWidth="full" py="md">
          <SectionHeader
            title="Start free. Subscribe when volume makes it cheaper."
            description={`${PLAN_COPY.payg.name} covers bursty campaigns with zero commitment. ${PLAN_COPY.pro.name} and ${PLAN_COPY.scale.name} include monthly credits at a ${PLAN_COPY.pro.creditRateAdvantage} better rate; ${PLAN_COPY.scale.name} adds multi-organization workflows.`}
            className="[&_h2]:text-5xl mb-4"
          />
          <NeuralGrid columns={3} className="gsap-grid">
            {getOrderedPlans().map((plan, index) => {
              const isFeatured = plan.tier === FEATURED_TIER;
              const isPayg = plan.type === 'payg';
              const ctaHref = isPayg
                ? paygSignUpHref
                : isFeatured
                  ? proSignUpHref
                  : plan.ctaHref || EnvironmentService.calendly;
              const ctaLabel = plan.cta || 'Get Started';

              return (
                <NeuralGridItem
                  key={plan.tier}
                  padding="lg"
                  className={cn(
                    'relative gsap-card',
                    isFeatured && 'bg-card hover:bg-card',
                  )}
                  tierLabel={`${String(index + 1).padStart(2, '0')} / ${getPlanLabel(plan.tier)}`}
                >
                  {isFeatured ? (
                    <div className="absolute right-6 top-6">
                      <span className="border border-edge/40 px-2.5 py-1 text-2xs font-bold uppercase tracking-widest text-surface/70">
                        Popular
                      </span>
                    </div>
                  ) : null}

                  <div className="mb-2">
                    {plan.launchPrice != null ? (
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-medium text-surface/40 line-through">
                          {formatPrice(plan.price)}
                        </span>
                        <span className="text-5xl font-semibold tracking-[-0.03em]">
                          {formatPrice(plan.launchPrice)}
                        </span>
                        {plan.type === 'subscription' ? (
                          <span className="text-sm font-medium text-surface/55">
                            /mo
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-5xl font-semibold tracking-[-0.03em]">
                          {formatPrice(plan.price)}
                        </span>
                        {plan.type === 'subscription' ? (
                          <span className="text-sm font-medium text-surface/55">
                            /mo
                          </span>
                        ) : null}
                      </div>
                    )}
                  </div>

                  <div
                    className={cn(
                      'text-sm text-surface/60',
                      plan.launchNote ? 'mb-1' : 'mb-8',
                    )}
                  >
                    {getPriceQualifier(plan)}
                  </div>

                  {plan.launchNote ? (
                    <div className="mb-8">
                      <span className="inline-flex items-center rounded-full border border-edge/15 px-2.5 py-1 text-xs font-medium text-surface/55">
                        {plan.launchNote}
                      </span>
                    </div>
                  ) : null}

                  <p className="mb-8 text-sm leading-6 text-surface/65">
                    {getPlanSummary(plan)}
                  </p>

                  <ul className="mb-auto space-y-4">
                    {plan.features.slice(0, 5).map((feature) => (
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
                    className="mt-12 w-full justify-center"
                    size={ButtonSize.PUBLIC}
                    variant={
                      isFeatured
                        ? ButtonVariant.DEFAULT
                        : ButtonVariant.SECONDARY
                    }
                  >
                    <a href={ctaHref} target="_blank" rel="noopener noreferrer">
                      {ctaLabel}
                    </a>
                  </Button>
                </NeuralGridItem>
              );
            })}
          </NeuralGrid>
          <p className="mt-6 text-center text-sm text-surface/50">
            Every paid plan includes API access at the same credit price. Create
            in the studio or via code, and it draws from the same credit
            balance. Higher plans get higher rate limits.
          </p>
          <NeuralGrid columns={1} className="mt-4">
            <NeuralGridItem
              padding="sm"
              className="flex flex-col gap-6 p-8 md:flex-row md:items-center md:justify-between"
            >
              <div className="max-w-2xl">
                <div className="mb-3 text-2xs font-black uppercase tracking-widest text-surface/45">
                  {enterprisePlan.label}
                </div>
                <h3 className="mb-2 text-2xl font-semibold tracking-[-0.02em]">
                  Your own studio, fully managed.
                </h3>
                <p className="text-sm leading-6 text-surface/65">
                  Custom output terms, unlimited seats and organizations, full
                  API access, white-label, SSO, and a dedicated account manager.
                </p>
              </div>

              <Button
                asChild
                className="shrink-0"
                size={ButtonSize.PUBLIC}
                variant={ButtonVariant.SECONDARY}
              >
                <a
                  href={enterprisePlan.ctaHref || EnvironmentService.calendly}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Book a Demo
                </a>
              </Button>
            </NeuralGridItem>
          </NeuralGrid>
        </WebSection>

        <ProofTestimonials context="pricing" />

        <WebSection maxWidth="lg" py="md">
          <SectionHeader
            title="What output costs."
            description="Every job shows its price before you run it. The router picks the best model for each format, and the price below is what you pay, whatever model runs."
            className="[&_h2]:text-5xl mb-4"
          />

          <div className="grid gap-px bg-edge/5 sm:grid-cols-2 lg:grid-cols-3">
            {OUTPUT_COSTS.map((row) => (
              <div
                key={row.label}
                className="flex items-baseline justify-between gap-4 bg-background px-5 py-4"
              >
                <span className="text-sm text-surface/65">{row.label}</span>
                <span className="text-sm font-semibold text-surface">
                  {formatCredits(row.credits)}
                  <span className="ml-2 font-normal text-surface/55">
                    ≈ {formatCreditsDollars(row.credits)}
                    {row.suffix ?? ''}
                  </span>
                </span>
              </div>
            ))}
          </div>

          <p className="mt-8 mb-2 text-sm font-medium text-surface/70">
            Top up any amount from $10. Pay-as-you-go, no subscription. 1 credit
            = $0.01.
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
            title="Common Questions"
            description="Pricing is intentionally simple: free to join, credits for output, subscriptions for better rates and scale."
            className="[&_h2]:text-5xl"
          />

          <FaqGrid items={FAQ_ITEMS} />
        </WebSection>

        <CtaSection
          bg="subtle"
          title="Start free. Pay per output."
          description="Book a demo only when the rollout needs team planning or enterprise terms."
        >
          <Button size={ButtonSize.PUBLIC} asChild>
            <a href={paygSignUpHref} target="_blank" rel="noopener noreferrer">
              Create now
            </a>
          </Button>
          <Button
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.PUBLIC}
            asChild
          >
            <a
              href={EnvironmentService.calendly}
              target="_blank"
              rel="noopener noreferrer"
            >
              Book a Demo
            </a>
          </Button>
        </CtaSection>
      </PageLayout>
    </div>
  );
}
