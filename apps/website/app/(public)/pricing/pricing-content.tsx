import { BOOKING_HREF } from '@data/booking.data';
import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { ONBOARDING_STARTER_CREDITS } from '@genfeedai/contracts/types';
import type { PlanTier } from '@genfeedai/pricing';
import {
  AVATAR_CREDIT_COSTS,
  creditPackPrice,
  creditPackTotalCredits,
  formatPrice,
  getPlanByTier,
  getPlanLabel,
  IMAGE_CREDIT_COSTS,
  INTERNAL_CREDIT_COSTS,
  PLAN_COPY,
  PRO_EARLY_ACCESS_DISCOUNT,
  VIDEO_CREDIT_COSTS,
  WEBSITE_CREDIT_PACKS,
  type websitePlans,
} from '@genfeedai/pricing';
import { cn } from '@helpers/formatting/cn/cn.util';
import { formatNumberWithCommas } from '@helpers/formatting/format/format.helper';
import { EnvironmentService } from '@services/core/environment.service';
import SectionHeader from '@ui/marketing/SectionHeader';
import { Button } from '@ui/primitives/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ui/primitives/table';
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
import {
  buildPricingCompareRows,
  COMPARE_CHECKMARK,
  getCompareColumnLabels,
} from './pricing-compare.data';

/**
 * Subscription cards, in order. Names resolve from @genfeedai/pricing. The
 * third card is Enterprise, which includes our team making the content, and
 * PAYG sits in its own block below.
 */
const PLAN_ORDER: PlanTier[] = ['pro', 'scale'];
const FEATURED_TIER: PlanTier = 'scale';

const FAQ_ITEMS = [
  {
    answer: `You get ${ONBOARDING_STARTER_CREDITS} free credits when you finish onboarding.`,
    question: 'Is there a free trial?',
  },
  {
    answer:
      'You see the price of every job in credits before it runs. Credits come with your plan or from a pay-as-you-go top-up.',
    question: 'How do credits work?',
  },
  {
    answer: 'No. Genfeed picks the best model for every job.',
    question: 'Do I choose the AI model?',
  },
  {
    answer: `Yes, on every plan. ${PLAN_COPY.pro.name} and ${PLAN_COPY.scale.name} have higher limits.`,
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
  {
    credits: IMAGE_CREDIT_COSTS.image1kTo2k.minCredits,
    label: 'Image (1K–2K)',
    maxCredits: IMAGE_CREDIT_COSTS.image1kTo2k.maxCredits,
  },
  { credits: IMAGE_CREDIT_COSTS.image4k, label: 'Image (4K)' },
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
            {getOrderedPlans().map((plan) => {
              const isFeatured = plan.tier === FEATURED_TIER;
              const ctaHref = plan.ctaHref || BOOKING_HREF;

              return (
                <NeuralGridItem
                  key={plan.tier}
                  padding="lg"
                  className={cn(
                    'relative gsap-card flex min-w-0 flex-col p-6 sm:p-6',
                    isFeatured && 'bg-card hover:bg-card',
                  )}
                  title={getPlanLabel(plan.tier)}
                  aria-label={getPlanLabel(plan.tier)}
                >
                  {isFeatured ? (
                    <div className="absolute right-6 top-6">
                      <span className="border border-foreground/40 px-2.5 py-1 text-2xs font-bold uppercase tracking-widest text-foreground/70">
                        Popular
                      </span>
                    </div>
                  ) : null}

                  <div className="mb-2 flex items-baseline gap-1.5 whitespace-nowrap">
                    <span className="text-4xl font-semibold tracking-[-0.02em] xl:text-5xl">
                      {formatPrice(plan.price)}
                    </span>
                    <span className="text-sm font-medium text-foreground/60">
                      /mo
                    </span>
                  </div>

                  <div className="text-sm text-foreground/60">
                    {getPriceQualifier(plan)}
                  </div>

                  <div className="mb-6 min-h-5 text-sm font-medium text-foreground">
                    {plan.tier === 'pro'
                      ? `${formatPrice(PRO_EARLY_ACCESS_DISCOUNT.amountOff)} off for ${PRO_EARLY_ACCESS_DISCOUNT.durationMonths} months with code ${PRO_EARLY_ACCESS_DISCOUNT.code}`
                      : null}
                  </div>

                  <ul className="mb-auto space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3">
                        <CircleCheck className="mt-0.5 size-4 shrink-0 text-foreground/60" />
                        <span className="text-sm text-foreground/60">
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
              title={getPlanLabel('enterprise')}
              aria-label={getPlanLabel('enterprise')}
            >
              <div className="absolute right-6 top-6">
                <span className="border border-foreground/20 px-2.5 py-1 text-2xs font-bold uppercase tracking-widest text-foreground/70">
                  We run it
                </span>
              </div>

              <div className="mb-2 flex items-baseline gap-1.5 whitespace-nowrap">
                <span className="text-sm font-medium text-foreground/60">
                  From
                </span>
                <span className="text-4xl font-semibold tracking-[-0.02em] xl:text-5xl">
                  {formatPrice(serviceOffering.startingMonthlyPrice)}
                </span>
                <span className="text-sm font-medium text-foreground/60">
                  /mo
                </span>
              </div>

              <div className="mb-6 text-sm text-foreground/60">
                {serviceOffering.priceNote}
              </div>

              <ul className="mb-auto space-y-3">
                {serviceOffering.includes.map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <CircleCheck className="mt-0.5 size-4 shrink-0 text-foreground/60" />
                    <span className="text-sm text-foreground/60">
                      {feature}
                    </span>
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

        <WebSection maxWidth="full" py="sm" className="pt-0 md:pt-0">
          <div className="flex flex-col gap-6 border border-foreground/10 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold">{getPlanLabel('payg')}</h2>
              <p className="mt-1 text-sm text-foreground/60">
                {getPriceQualifier(getPlanByTier('payg'))} ·{' '}
                {ONBOARDING_STARTER_CREDITS} free credits after onboarding
              </p>
              <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
                {getPlanByTier('payg').features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <CircleCheck className="mt-0.5 size-4 shrink-0 text-foreground/60" />
                    <span className="text-sm text-foreground/60">
                      {feature}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <Button
              asChild
              className="w-full justify-center sm:w-auto"
              size={ButtonSize.PUBLIC}
              variant={ButtonVariant.SECONDARY}
            >
              <a
                href={paygSignUpHref}
                target="_blank"
                rel="noopener noreferrer"
              >
                {getPlanByTier('payg').cta || 'Get Started'}
              </a>
            </Button>
          </div>
        </WebSection>

        <WebSection maxWidth="lg" py="md">
          <SectionHeader
            title="Compare plans."
            className="[&_h2]:text-4xl sm:[&_h2]:text-5xl mb-4"
          />
          <Table aria-label="Compare plans">
            <TableHeader>
              <TableRow>
                <TableHead>
                  <span className="sr-only">Feature</span>
                </TableHead>
                {getCompareColumnLabels().map((label) => (
                  <TableHead key={label}>{label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {buildPricingCompareRows().map((row) => (
                <TableRow key={row.label}>
                  <TableHead
                    scope="row"
                    className="h-auto p-2 text-sm font-medium normal-case tracking-normal text-foreground"
                  >
                    {row.label}
                  </TableHead>
                  {row.values.map((value, index) => (
                    <TableCell
                      key={`${row.label}-${getCompareColumnLabels()[index]}`}
                      className="text-foreground/70"
                    >
                      {value === COMPARE_CHECKMARK ? (
                        <span role="img" aria-label="Included">
                          {value}
                        </span>
                      ) : (
                        value
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </WebSection>

        <ProofTestimonials context="pricing" />

        <WebSection maxWidth="lg" py="md">
          <SectionHeader
            title="What output costs."
            className="[&_h2]:text-4xl sm:[&_h2]:text-5xl mb-4"
          />

          <div className="grid gap-px bg-foreground/10 sm:grid-cols-2 lg:grid-cols-3">
            {OUTPUT_COSTS.map((row) => (
              <div
                key={row.label}
                className="flex items-baseline justify-between gap-4 bg-background px-5 py-4"
              >
                <span className="text-sm text-foreground/70">{row.label}</span>
                <span className="text-sm font-semibold text-foreground">
                  {formatCredits(row.credits, row.maxCredits)}
                  {row.suffix ? (
                    <span className="ml-1 font-normal text-foreground/60">
                      {row.suffix}
                    </span>
                  ) : null}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-foreground/60">
            Image prices are for FLUX.3. Other models are priced per model, and
            Studio shows the exact credits before you run.
          </p>

          <p className="mt-8 mb-2 text-sm font-medium text-foreground/70">
            Top up from $10.
          </p>
          <div className="grid gap-px bg-foreground/10 sm:grid-cols-3">
            {WEBSITE_CREDIT_PACKS.map((pack) => (
              <div
                key={pack.label}
                className="flex items-baseline justify-between gap-4 bg-background px-5 py-4"
              >
                <span className="text-sm font-semibold text-foreground">
                  ${formatNumberWithCommas(creditPackPrice(pack))}
                </span>
                <span className="text-sm text-foreground/60">
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
