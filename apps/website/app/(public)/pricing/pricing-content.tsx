'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import {
  AVATAR_CREDIT_COSTS,
  BYOK_CREDIT_VALUE_DOLLARS,
  creditPackPrice,
  creditPackTotalCredits,
  formatPrice,
  INTERNAL_CREDIT_COSTS,
  VIDEO_CREDIT_COSTS,
  WEBSITE_CREDIT_PACKS,
  websitePlans,
} from '@helpers/business/pricing/pricing.helper';
import { cn } from '@helpers/formatting/cn/cn.util';
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
import { HiCheckCircle } from 'react-icons/hi2';

const PLAN_ORDER = ['Pay As You Go', 'Hosted', 'Cloud Teams'];
const FEATURED_TIER = 'Hosted';

const FAQ_ITEMS = [
  {
    answer:
      'Signing up is free. Credits buy the output you generate: images, reels, ads, articles, avatar clips, and voice. Subscriptions exist to make credits cheaper and to unlock more brands, channels, and seats.',
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
    answer:
      'Creator ($49/month) includes 8,000 credits (about $80 of pay-as-you-go output) plus 5 brand kits and 15 connected channels. Teams ($499/month) includes 5 seats, 80,000 credits in a shared pool, multi-organization control, and approvals.',
    question: 'What do subscriptions add?',
  },
  {
    answer:
      'Pay As You Go includes 1 brand kit and 3 connected channels. Creator raises that to 5 brand kits and 15 channels. Teams and Enterprise remove the limits and add organizations and seats.',
    question: 'How many brands and channels can I connect?',
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
  'Seats and shared pools for teams',
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
  return `${credits.toLocaleString()} credits`;
}

function formatCreditsDollars(credits: number): string {
  return `$${(credits * BYOK_CREDIT_VALUE_DOLLARS).toFixed(2)}`;
}

function getOrderedPlans() {
  const plansByLabel = new Map(websitePlans.map((plan) => [plan.label, plan]));
  const orderedPlans: (typeof websitePlans)[number][] = [];

  for (const label of PLAN_ORDER) {
    const plan = plansByLabel.get(label);

    if (plan) {
      orderedPlans.push(plan);
    }
  }

  return orderedPlans;
}

function getDisplayName(label: string): string {
  if (label === 'Hosted') {
    return 'Creator';
  }
  if (label === 'Cloud Teams') {
    return 'Teams';
  }
  return label;
}

function getPriceQualifier(plan: (typeof websitePlans)[number]): string {
  if (plan.type === 'payg') {
    return 'No monthly fee, buy credit packs as you go';
  }

  if (plan.type === 'subscription') {
    const credits = plan.includedCredits?.toLocaleString();

    return plan.label === 'Cloud Teams'
      ? `5 seats + ${credits} credits`
      : `${credits} credits included`;
  }

  return 'Custom terms';
}

function getPlanSummary(plan: (typeof websitePlans)[number]): string {
  return plan.valueProposition || plan.description;
}

export default function PricingContent() {
  const containerRef = useMarketingEntrance({ hero: false, sections: false });
  const paygSignUpHref = `${EnvironmentService.apps.app}/sign-up?plan=payg`;
  const creatorSignUpHref = `${EnvironmentService.apps.app}/sign-up?plan=hosted`;
  const enterprisePlan = websitePlans.find((p) => p.type === 'enterprise');

  return (
    <div ref={containerRef}>
      <PageLayout
        title={<>Credits for output. Subscriptions for scale.</>}
        description="Signing up is free. Credits buy the content you generate; a subscription makes those credits cheaper and unlocks more brands, channels, and seats."
      >
        <WebSection maxWidth="lg" py="md">
          <div className="grid gap-px overflow-hidden border border-edge/5 bg-fill/5 md:grid-cols-4">
            {PRICING_RULES.map((rule) => (
              <div key={rule} className="bg-background px-5 py-4">
                <div className="flex items-center gap-2 text-sm text-surface/65">
                  <HiCheckCircle className="size-4 text-success" />
                  {rule}
                </div>
              </div>
            ))}
          </div>
        </WebSection>

        <WebSection maxWidth="full" py="md">
          <SectionHeader
            title="Start free. Subscribe when volume makes it cheaper."
            description="Pay As You Go covers bursty campaigns with zero commitment. Creator and Teams include monthly credits at a ~40% better rate, plus more brands, channels, and seats."
            className="[&_h2]:text-5xl mb-4"
          />

          <NeuralGrid columns={3} className="gsap-grid">
            {getOrderedPlans().map((plan, index) => {
              const isFeatured = plan.label === FEATURED_TIER;
              const isPayg = plan.type === 'payg';
              const ctaHref = isPayg
                ? paygSignUpHref
                : isFeatured
                  ? creatorSignUpHref
                  : plan.ctaHref || EnvironmentService.calendly;
              const ctaLabel = plan.cta || 'Get Started';

              return (
                <NeuralGridItem
                  key={plan.label}
                  padding="lg"
                  className={cn(
                    'relative gsap-card',
                    isFeatured && 'bg-white/[0.03]',
                  )}
                  tierLabel={`${String(index + 1).padStart(2, '0')} / ${getDisplayName(plan.label)}`}
                >
                  {isFeatured ? (
                    <div className="absolute right-6 top-6">
                      <span className="border border-edge/40 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-surface/70">
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
                    <div className="mb-8 text-xs font-semibold uppercase tracking-widest text-surface/60">
                      {plan.launchNote}
                    </div>
                  ) : null}

                  <p className="mb-8 text-sm leading-6 text-surface/65">
                    {getPlanSummary(plan)}
                  </p>

                  <ul className="mb-auto space-y-4">
                    {plan.features.slice(0, 5).map((feature) => (
                      <li key={feature} className="flex items-start gap-3">
                        <HiCheckCircle className="mt-0.5 size-4 shrink-0 text-surface/55" />
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
                      isFeatured ? ButtonVariant.WHITE : ButtonVariant.OUTLINE
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

          {enterprisePlan ? (
            <div className="mt-4 flex flex-col gap-6 border border-edge/5 bg-background p-8 md:flex-row md:items-center md:justify-between">
              <div className="max-w-2xl">
                <div className="mb-3 text-[10px] font-black uppercase tracking-widest text-surface/45">
                  Enterprise
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
                variant={ButtonVariant.OUTLINE}
              >
                <a
                  href={enterprisePlan.ctaHref || EnvironmentService.calendly}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Book a Demo
                </a>
              </Button>
            </div>
          ) : null}
        </WebSection>

        <WebSection maxWidth="lg" py="md">
          <SectionHeader
            title="What output costs."
            description="Every job shows its price before you run it. The router picks the best model for each format, and the price below is what you pay, whatever model runs."
            className="[&_h2]:text-5xl mb-4"
          />

          <div className="grid gap-px overflow-hidden border border-edge/5 bg-fill/5 sm:grid-cols-2 lg:grid-cols-3">
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

          <div className="mt-px grid gap-px overflow-hidden border border-edge/5 bg-fill/5 sm:grid-cols-3">
            {WEBSITE_CREDIT_PACKS.map((pack) => (
              <div key={pack.label} className="bg-background px-5 py-4">
                <div className="text-xs font-bold uppercase tracking-widest text-surface/55">
                  {pack.label} pack
                </div>
                <div className="mt-1 text-sm text-surface/65">
                  ${creditPackPrice(pack).toLocaleString()} →{' '}
                  {creditPackTotalCredits(pack).toLocaleString()} credits
                  {pack.bonus ? (
                    <span className="text-success">
                      {' '}
                      (+{pack.bonus.toLocaleString()} bonus)
                    </span>
                  ) : null}
                </div>
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
