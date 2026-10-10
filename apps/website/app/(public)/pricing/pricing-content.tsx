import { BOOKING_HREF } from '@data/booking.data';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
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
import MarketingArtwork from '@web-components/content/MarketingArtwork';
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
    answer: `${serviceOffering.priceLabel}. ${serviceOffering.description} Book a call to agree on deliverables, channels, timing, review rounds, and how software credits are covered. Self-serve plans need no sales call.`,
    question: 'What does Done for you include?',
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
  return `$${(credits * CREDIT_VALUE_DOLLARS).toFixed(2)}`;
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

function getPlanSummary(plan: (typeof websitePlans)[number]): string {
  return plan.valueProposition || plan.description;
}

export default function PricingContent() {
  const paygSignUpHref = `${EnvironmentService.apps.app}/sign-up?plan=payg`;
  const proSignUpHref = `${EnvironmentService.apps.app}/sign-up?plan=pro`;
  const enterprisePlan = getPlanByTier('enterprise');

  return (
    <MarketingEntrance hero={false} sections={false}>
      <PageLayout
        title={
          <>
            Your content.
            <br />
            Your way of working.
          </>
        }
        description="Run it yourself with credits, or let our team handle strategy, production, and publishing. Choose how hands-on you want to be."
      >
        <WebSection maxWidth="full" py="sm">
          <p className="mb-8 max-w-3xl text-base leading-relaxed text-surface/65">
            {`${PLAN_COPY.payg.name} covers bursty campaigns with zero commitment. ${PLAN_COPY.pro.name} and ${PLAN_COPY.scale.name} include monthly credits at a ${PLAN_COPY.pro.creditRateAdvantage} better rate; ${PLAN_COPY.scale.name} adds multi-organization workflows.`}
          </p>
          <div className="grid items-stretch gap-8 xl:grid-cols-[3fr_2fr]">
            <section
              aria-labelledby="self-serve-heading"
              className="flex min-w-0 flex-col"
            >
              <h2
                id="self-serve-heading"
                className="mb-5 text-xs font-bold uppercase tracking-widest text-surface/65"
              >
                Self-serve · you run it
              </h2>
              <NeuralGrid
                columns={3}
                className="gsap-grid flex-1 md:grid-cols-3"
              >
                {getOrderedPlans().map((plan, index) => {
                  const isFeatured = plan.tier === FEATURED_TIER;
                  const isPayg = plan.type === 'payg';
                  const ctaHref = isPayg
                    ? paygSignUpHref
                    : isFeatured
                      ? proSignUpHref
                      : plan.ctaHref || BOOKING_HREF;
                  const ctaLabel = plan.cta || 'Get Started';

                  return (
                    <NeuralGridItem
                      key={plan.tier}
                      padding="lg"
                      className={cn(
                        'relative gsap-card min-w-0 p-6 sm:p-6',
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

                      <div className="mb-2 flex min-h-14 items-baseline gap-1.5 whitespace-nowrap">
                        <span className="text-4xl font-semibold tracking-[-0.03em] xl:text-5xl">
                          {isPayg
                            ? `$${CREDIT_VALUE_DOLLARS.toFixed(2)}`
                            : formatPrice(plan.launchPrice ?? plan.price)}
                        </span>
                        <span className="text-sm font-medium text-surface/55">
                          {isPayg ? '/credit' : '/mo'}
                        </span>
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
                        <p className="mb-8 text-xs leading-5 text-surface/55">
                          {plan.launchNote.replace('EARLYGENFEED · ', 'First ')}
                        </p>
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
                        <a
                          href={ctaHref}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {ctaLabel}
                        </a>
                      </Button>
                    </NeuralGridItem>
                  );
                })}
              </NeuralGrid>
            </section>
            <section
              aria-labelledby="done-for-you-heading"
              className="flex min-w-0 flex-col"
            >
              <h2
                id="done-for-you-heading"
                className="mb-5 text-xs font-bold uppercase tracking-widest text-surface/65"
              >
                Done for you · we run it
              </h2>
              <NeuralGrid columns={1} className="flex-1">
                <NeuralGridItem
                  padding="sm"
                  className="p-0 sm:p-0 bg-card hover:bg-card"
                >
                  <div className="p-6 sm:p-8">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                      <h3 className="text-2xl font-semibold tracking-[-0.02em]">
                        {serviceOffering.name}
                      </h3>
                      <span className="border border-edge/20 px-2.5 py-1 text-xs text-surface/65">
                        With our team
                      </span>
                    </div>
                    <p className="mb-3 flex items-baseline gap-1.5 whitespace-nowrap">
                      <span className="text-base text-surface/70">From</span>
                      <span className="text-5xl font-semibold tracking-[-0.03em] sm:text-6xl">
                        {formatPrice(serviceOffering.startingMonthlyPrice)}
                      </span>
                      <span className="text-sm text-surface/55">/month</span>
                    </p>
                    <p className="text-xs leading-5 text-surface/60">
                      {serviceOffering.priceNote}
                    </p>
                  </div>
                  <div className="overflow-hidden [&_figure]:rounded-none">
                    <MarketingArtwork page="/done-for-you" isCompact />
                  </div>
                  <div className="flex flex-1 flex-col p-6 sm:p-8">
                    <p className="mb-6 text-sm leading-6 text-surface/65">
                      {serviceOffering.description}
                    </p>
                    <ul className="mb-auto space-y-4">
                      {serviceOffering.includes.map((feature) => (
                        <li key={feature} className="flex items-start gap-3">
                          <CircleCheck className="mt-0.5 size-4 shrink-0 text-surface/55" />
                          <span className="text-sm text-surface/65">
                            {feature}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <Button
                      asChild
                      className="mt-8 w-full justify-center"
                      size={ButtonSize.PUBLIC}
                    >
                      <Link href={BOOKING_HREF}>{serviceOffering.cta}</Link>
                    </Button>
                    <p className="mt-3 text-center text-xs text-surface/55">
                      30 minutes on your channels, output target, and scope.
                    </p>
                    <Link
                      href="/done-for-you"
                      className="mt-4 text-center text-xs text-surface/65 underline underline-offset-4 hover:text-surface"
                    >
                      Explore the service
                    </Link>
                  </div>
                </NeuralGridItem>
              </NeuralGrid>
            </section>
          </div>
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
                <div className="mb-3 text-xs font-bold uppercase tracking-widest text-surface/60">
                  {enterprisePlan.label}
                </div>
                <h3 className="mb-2 text-2xl font-semibold tracking-[-0.02em]">
                  Custom terms for your organization.
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
                <a href={BOOKING_HREF}>{enterprisePlan.cta}</a>
              </Button>
            </NeuralGridItem>
          </NeuralGrid>
        </WebSection>

        <ProofTestimonials context="pricing" />

        <WebSection maxWidth="lg" py="md">
          <div className="grid gap-px bg-edge/5 md:grid-cols-4">
            {PRICING_RULES.map((rule) => (
              <div key={rule} className="bg-background px-5 py-4">
                <div className="flex items-center gap-2 text-sm text-surface/65">
                  <CircleCheck className="size-4 text-surface/55" />
                  {rule}
                </div>
              </div>
            ))}
          </div>
        </WebSection>

        <WebSection maxWidth="lg" py="md">
          <SectionHeader
            title="What output costs."
            description="Every job shows its price before you run it. The router picks the best model for each format, and the price below is what you pay, whatever model runs."
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
            className="[&_h2]:text-4xl sm:[&_h2]:text-5xl"
          />

          <FaqGrid items={FAQ_ITEMS} />
        </WebSection>

        <CtaSection
          bg="subtle"
          title="Pay as you go. Create on your terms."
          description="Connect the agent you already use, or start in the studio. Both draw from the same credits."
        >
          <AgentFirstActions
            signUpHref={paygSignUpHref}
            trackingName="pricing_cta_click"
          />
        </CtaSection>
      </PageLayout>
    </MarketingEntrance>
  );
}
