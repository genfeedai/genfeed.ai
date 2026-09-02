'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { useMarketingEntrance } from '@hooks/ui/use-marketing-entrance';
import { EnvironmentService } from '@services/core/environment.service';
import ButtonTracked from '@ui/buttons/tracked/ButtonTracked';
import PricingStrip from '@ui/marketing/PricingStrip';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import PageLayout from '@web-components/PageLayout';
import ProductInterfacePreview from '@web-components/product/ProductInterfacePreview';
import {
  ChartColumn,
  ChartLine,
  ChartNoAxesColumn,
  Flame,
  Sparkles,
  TrendingUp,
  Zap,
} from 'lucide-react';

const CALENDLY_URL = EnvironmentService.calendly;

const METRICS = [
  {
    icon: ChartColumn,
    label: 'Overview Dashboard',
    value: 'Revenue and output at a glance',
  },
  {
    icon: ChartNoAxesColumn,
    label: 'Post Analytics',
    value: 'Every post scored against revenue',
  },
  {
    icon: Flame,
    label: 'Streaks',
    value: 'Consistency tracked and rewarded',
  },
];

const FEATURES = [
  {
    description:
      'See which posts drive revenue, not just likes, with attribution tied to every publish.',
    icon: ChartColumn,
    title: 'Revenue Attribution',
  },
  {
    description:
      'Track hooks and trends that convert, so the next post starts from what already works.',
    icon: TrendingUp,
    title: 'Hook & Trend Analysis',
  },
  {
    description:
      'Run A/B tests in the performance lab to prove what actually moves the number.',
    icon: ChartLine,
    title: 'Performance Lab',
  },
  {
    description:
      'Keep the streak alive with consistency tracking across every brand and channel.',
    icon: Flame,
    title: 'Streaks & Consistency',
  },
  {
    description:
      'Roll up performance per brand to see what is working across your whole portfolio.',
    icon: Zap,
    title: 'Per-Brand Rollups',
  },
];

const STEPS = [
  {
    icon: ChartNoAxesColumn,
    label: 'Publish',
    sublabel: 'Ship content across every connected platform',
  },
  {
    icon: ChartColumn,
    label: 'Measure',
    sublabel: 'Attribute revenue and engagement to each post',
  },
  {
    icon: ChartLine,
    label: 'Learn',
    sublabel: 'Spot the hooks and trends that convert',
  },
  {
    icon: TrendingUp,
    label: 'Double Down',
    sublabel: 'Repeat what works and cut what does not',
  },
];

const HIGHLIGHT_TAGS = ['Revenue', 'Trends', 'Hooks', 'Streaks'];

const HERO_VISUAL = (
  <ProductInterfacePreview
    product={{
      category: 'Intelligence',
      features: FEATURES,
      headline: 'Revenue, trend, hook, and per-brand performance in one view.',
      name: 'Analytics',
      useCases: STEPS.map((step) => ({
        description: step.sublabel,
        title: step.label,
      })),
    }}
  />
);

export default function AnalyticsContent() {
  const containerRef = useMarketingEntrance();
  const signUpHref = `${EnvironmentService.apps.app}/sign-up?plan=payg`;

  return (
    <div ref={containerRef}>
      <PageLayout
        heroActions={
          <>
            <ButtonTracked
              asChild
              size={ButtonSize.PUBLIC}
              trackingName="analytics_hero_click"
              trackingData={{ action: 'create_now' }}
            >
              <a href={signUpHref} target="_blank" rel="noopener noreferrer">
                Create now
              </a>
            </ButtonTracked>
            <ButtonTracked
              asChild
              variant={ButtonVariant.SECONDARY}
              size={ButtonSize.PUBLIC}
              trackingName="analytics_hero_click"
              trackingData={{ action: 'book_demo' }}
            >
              <a href={CALENDLY_URL} target="_blank" rel="noopener noreferrer">
                Book a Demo
              </a>
            </ButtonTracked>
          </>
        }
        heroVisual={HERO_VISUAL}
        compact
        title="Analytics"
        description="See exactly which content earns, and do more of it."
      >
        {/* Highlight Card */}
        <section className="gsap-section max-w-4xl mx-auto pb-16 px-6">
          <div className="border border-[var(--gen-accent-border)] bg-[var(--gen-accent-bg)] p-8">
            <div className="flex flex-row flex-col md:flex-row items-center gap-8">
              <div className="flex-shrink-0">
                <div className="flex size-20 items-center justify-center border border-[var(--gen-accent-border)] bg-[var(--gen-accent-tint)]">
                  <ChartColumn className="size-10 text-surface" />
                </div>
              </div>
              <div className="flex flex-col gap-3">
                <Heading as="h3" className="text-2xl font-bold">
                  Every Metric Tied to Revenue
                </Heading>
                <Text as="p" className="text-surface/65">
                  Stop guessing from likes and views. See post, trend, and
                  per-brand performance mapped straight to revenue, with a hook
                  lab that tells you what to make next.
                </Text>
                <div className="flex flex-row items-center flex-wrap gap-2">
                  {HIGHLIGHT_TAGS.map((tag) => (
                    <span
                      key={tag}
                      className="px-3 py-1 text-xs border border-[var(--gen-accent-border)] text-[var(--gen-accent-text)]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Metrics Showcase */}
        <section className="max-w-4xl mx-auto pb-16 px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-1.5">
            {METRICS.map((metric) => {
              const Icon = metric.icon;
              return (
                <div
                  key={metric.label}
                  className="gen-contact-sheet p-6 bg-fill/[0.02] text-center"
                >
                  <div className="flex justify-center mb-3">
                    <div className="size-12 flex items-center justify-center border border-[var(--gen-accent-border)] bg-[var(--gen-accent-bg)]">
                      <Icon className="size-6 text-[color:hsl(var(--gen-accent))]" />
                    </div>
                  </div>
                  <Text className="text-sm font-bold text-surface">
                    {metric.label}
                  </Text>
                  <Text className="text-xs text-surface/65">
                    {metric.value}
                  </Text>
                </div>
              );
            })}
          </div>
        </section>

        {/* Features Grid */}
        <section className="gsap-section max-w-6xl mx-auto pb-16 px-6">
          <Heading as="h3" className="text-2xl font-bold text-center mb-8">
            Everything You Need to Learn
          </Heading>
          <div className="gsap-grid grid grid-cols-1 md:grid-cols-3 gap-1.5">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="gsap-card gen-card-spotlight p-8 text-center"
                >
                  <div className="flex justify-center mb-4">
                    <div className="size-12 flex items-center justify-center border border-[var(--gen-accent-border)] bg-[var(--gen-accent-bg)]">
                      <Icon className="size-6 text-[color:hsl(var(--gen-accent))]" />
                    </div>
                  </div>
                  <Heading as="h4" className="font-semibold mb-2 text-surface">
                    {feature.title}
                  </Heading>
                  <Text className="text-sm text-surface/65">
                    {feature.description}
                  </Text>
                </div>
              );
            })}
          </div>
        </section>

        {/* How It Works */}
        <section className="gsap-section max-w-4xl mx-auto pb-16 px-6">
          <Heading as="h3" className="text-2xl font-bold text-center mb-12">
            How It Works
          </Heading>
          <div className="space-y-0">
            {STEPS.map((step, index) => {
              const Icon = step.icon;
              return (
                <div key={step.label}>
                  <div className="flex flex-row items-center gap-6 py-6">
                    <div className="flex-shrink-0 size-14 flex items-center justify-center border border-[var(--gen-accent-border)] bg-[var(--gen-accent-bg)]">
                      <Icon className="size-6 text-[color:hsl(var(--gen-accent))]" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Text className="text-lg font-bold text-surface">
                        {step.label}
                      </Text>
                      <Text className="text-sm text-surface/65">
                        {step.sublabel}
                      </Text>
                    </div>
                  </div>
                  {index < STEPS.length - 1 && (
                    <div className="gen-divider-accent" />
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Pricing CTA */}
        <section className="max-w-4xl mx-auto pb-16 px-6">
          <div className="border border-[var(--gen-accent-border)] bg-[var(--gen-accent-bg)] p-12 text-center">
            <div className="flex justify-center mb-4">
              <Sparkles className="size-8 text-surface" />
            </div>
            <Heading as="h3" className="text-2xl font-bold mb-2 text-surface">
              Know What Works. Do More.
            </Heading>
            <Text as="p" className="text-surface/70 mb-6 max-w-lg mx-auto">
              Revenue attribution, hook analysis, and per-brand rollups built
              into the studio. No spreadsheets required.
            </Text>
            <PricingStrip className="mb-6" />
            <div className="flex flex-row items-center flex-wrap gap-4 justify-center">
              <ButtonTracked
                asChild
                size={ButtonSize.PUBLIC}
                trackingName="analytics_cta_click"
                trackingData={{ action: 'create_now' }}
              >
                <a href={signUpHref} target="_blank" rel="noopener noreferrer">
                  Create now
                </a>
              </ButtonTracked>
              <ButtonTracked
                asChild
                variant={ButtonVariant.SECONDARY}
                size={ButtonSize.PUBLIC}
                trackingName="analytics_cta_click"
                trackingData={{ action: 'book_demo' }}
              >
                <a
                  href={CALENDLY_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Book a Demo
                </a>
              </ButtonTracked>
            </div>
          </div>
        </section>
      </PageLayout>
    </div>
  );
}
