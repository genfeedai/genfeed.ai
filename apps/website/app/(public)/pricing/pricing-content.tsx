'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import {
  formatPrice,
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
import Link from 'next/link';
import { HiCheckCircle } from 'react-icons/hi2';
import { LuArrowRight, LuSparkles } from 'react-icons/lu';

const CALENDLY_URL =
  process.env.NEXT_PUBLIC_CALENDLY_URL ||
  'https://calendly.com/vincent-genfeed/30min';

const PLAN_ORDER = ['Hosted', 'Cloud Teams', 'Enterprise', 'Self-Hosted'];
const FEATURED_TIER = 'Hosted';

const FAQ_ITEMS = [
  {
    answer:
      'Genfeed separates platform access from output usage. Start with the Cloud App at $49/month, then pay as you go for videos, images, and voice output.',
    question: 'How does pricing work?',
  },
  {
    answer:
      'No. The entry cloud plan does not bundle artificial quotas. Output usage scales with what you actually create.',
    question: 'Are credits shown to customers?',
  },
  {
    answer:
      'Cloud App and Cloud Teams use managed premium models. You do not need to configure model keys to start creating.',
    question: 'Do I need my own AI keys?',
  },
  {
    answer:
      'Cloud Teams adds collaboration workspaces, roles, organization boundaries, brand operations, shared approvals, managed billing, and priority support.',
    question: 'When should I use Cloud Teams?',
  },
  {
    answer:
      'Yes. Self-hosted Core remains free for teams that want to run Genfeed on their own infrastructure with their own AI keys.',
    question: 'Can I still self-host?',
  },
  {
    answer:
      'Book a demo when you need team rollout planning, migration support, enterprise terms, or a multi-brand workflow designed before signup.',
    question: 'When should I book a demo?',
  },
];

const PAYG_RULES = [
  'Cloud app first',
  '$49/month platform access',
  'Pay-as-you-go output',
  'Book a demo for team rollout',
] as const;

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
  return label === 'Hosted' ? 'Cloud App' : label;
}

function getPriceQualifier(plan: (typeof websitePlans)[number]): string {
  if (plan.type === 'payg') {
    return '/month platform access + PAYG output';
  }

  if (plan.type === 'subscription') {
    return '/month + PAYG output';
  }

  if (plan.type === 'byok') {
    return 'Self-managed';
  }

  return 'Custom terms';
}

function getPlanSummary(plan: (typeof websitePlans)[number]): string {
  if (plan.label === 'Hosted') {
    return 'The default path: managed Genfeed, managed models, and usage-based output billing.';
  }

  if (plan.label === 'Cloud Teams') {
    return 'B2B cloud for collaboration, organizations, brands, approvals, and managed billing.';
  }

  return plan.valueProposition || plan.description;
}

export default function PricingContent() {
  const containerRef = useMarketingEntrance({ hero: false, sections: false });
  const signUpHref = `${EnvironmentService.apps.app}/sign-up?plan=hosted`;

  return (
    <div ref={containerRef}>
      <PageLayout
        badge="Pricing"
        badgeIcon={LuSparkles}
        title={
          <>
            Cloud app pricing,{' '}
            <span className="italic font-light">usage-based output.</span>
          </>
        }
        description="Start with managed Genfeed. Pay for platform access, then pay only for the videos, images, and voice output you create."
      >
        <WebSection maxWidth="lg" py="md">
          <div className="grid gap-px overflow-hidden border border-edge/5 bg-fill/5 md:grid-cols-4">
            {PAYG_RULES.map((rule) => (
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
            title="Choose the smallest managed plan that fits."
            description="The website leads with the Cloud App. Self-hosting is still available, but it is no longer the default buyer path."
            className="[&_h2]:text-5xl mb-4"
          />

          <NeuralGrid columns={4} className="gsap-grid">
            {getOrderedPlans().map((plan, index) => {
              const isFeatured = plan.label === FEATURED_TIER;
              const isSelfHosted = plan.type === 'byok';
              const isEnterprise = plan.type === 'enterprise';
              const ctaHref = isSelfHosted
                ? '/host'
                : isFeatured
                  ? signUpHref
                  : plan.ctaHref || CALENDLY_URL;
              const ctaLabel = isFeatured
                ? 'Start Cloud App'
                : plan.cta || 'Get Started';
              const isExternal = !isSelfHosted;

              return (
                <NeuralGridItem
                  key={plan.label}
                  inverted={isFeatured}
                  padding="lg"
                  className={cn(
                    'relative gsap-card',
                    !isFeatured && 'bg-fill/[0.02]',
                  )}
                  tierLabel={`${String(index + 1).padStart(2, '0')} / ${getDisplayName(plan.label)}`}
                >
                  {isFeatured ? (
                    <div className="absolute right-6 top-6">
                      <span className="bg-zinc-950 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-surface">
                        Default
                      </span>
                    </div>
                  ) : null}

                  <div className="mb-2">
                    <span
                      className={cn(
                        'text-5xl font-serif',
                        isFeatured && 'text-inv-fg',
                      )}
                    >
                      {isEnterprise ? 'Custom' : formatPrice(plan.price)}
                    </span>
                  </div>

                  <div
                    className={cn(
                      'mb-8 text-sm',
                      isFeatured ? 'text-inv-fg/50' : 'text-surface/40',
                    )}
                  >
                    {getPriceQualifier(plan)}
                  </div>

                  <p
                    className={cn(
                      'mb-8 text-sm leading-6',
                      isFeatured ? 'text-inv-fg/60' : 'text-surface/50',
                    )}
                  >
                    {getPlanSummary(plan)}
                  </p>

                  <ul className="mb-auto space-y-4">
                    {plan.features.slice(0, 5).map((feature) => (
                      <li key={feature} className="flex items-start gap-3">
                        <HiCheckCircle
                          className={cn(
                            'mt-0.5 size-4 shrink-0',
                            isFeatured ? 'text-inv-fg/35' : 'text-surface/40',
                          )}
                        />
                        <span
                          className={cn(
                            'text-sm',
                            isFeatured ? 'text-inv-fg/60' : 'text-surface/60',
                          )}
                        >
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
                      isFeatured ? ButtonVariant.BLACK : ButtonVariant.OUTLINE
                    }
                  >
                    {isExternal ? (
                      <a
                        href={ctaHref}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {ctaLabel}
                      </a>
                    ) : (
                      <Link href={ctaHref}>{ctaLabel}</Link>
                    )}
                  </Button>
                </NeuralGridItem>
              );
            })}
          </NeuralGrid>
        </WebSection>

        <WebSection bg="bordered" maxWidth="md">
          <SectionHeader
            title="Common Questions"
            description="Pricing is intentionally simple: managed access first, usage-based output second."
            className="[&_h2]:text-5xl"
          />

          <FaqGrid items={FAQ_ITEMS} />
        </WebSection>

        <CtaSection
          bg="subtle"
          title="Start with Cloud App."
          description="Book a demo only when the rollout needs team planning or enterprise terms."
        >
          <Button size={ButtonSize.PUBLIC} asChild>
            <a href={signUpHref} target="_blank" rel="noopener noreferrer">
              Start Cloud App
              <LuArrowRight className="size-4" />
            </a>
          </Button>
          <Button
            variant={ButtonVariant.SECONDARY}
            size={ButtonSize.PUBLIC}
            asChild
          >
            <a href={CALENDLY_URL} target="_blank" rel="noopener noreferrer">
              Book a Demo
            </a>
          </Button>
        </CtaSection>
      </PageLayout>
    </div>
  );
}
