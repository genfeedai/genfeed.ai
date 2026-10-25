import { EnvironmentService } from '@services/core/environment.service';
import PricingStrip from '@ui/marketing/PricingStrip';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import AgentFirstActions from '@web-components/buttons/agent-first-actions/AgentFirstActions';
import MarketingArtwork from '@web-components/content/MarketingArtwork';
import MarketingEntrance from '@web-components/MarketingEntrance';
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

const FEATURES = [
  {
    description:
      'Compare available views and engagement across your published posts.',
    icon: ChartColumn,
    title: 'Post Performance',
  },
  {
    description:
      'Review hooks and trends alongside available performance data to plan your next post.',
    icon: TrendingUp,
    title: 'Hook & Trend Analysis',
  },
  {
    description:
      'Compare published variations and use their performance to guide your next brief.',
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
    sublabel: 'Review available views and engagement per post',
  },
  {
    icon: ChartLine,
    label: 'Learn',
    sublabel: 'Find formats that earn views and engagement',
  },
  {
    icon: TrendingUp,
    label: 'Double Down',
    sublabel: 'Repeat what works and cut what does not',
  },
];

const HERO_VISUAL = (
  <ProductInterfacePreview
    product={{
      category: 'Intelligence',
      features: FEATURES,
      headline: 'Post, trend, hook and brand performance in one view.',
      name: 'Analytics',
      useCases: STEPS.map((step) => ({
        description: step.sublabel,
        title: step.label,
      })),
    }}
  />
);

export default function AnalyticsContent() {
  const signUpHref = `${EnvironmentService.apps.app}/sign-up?plan=payg`;

  return (
    <MarketingEntrance>
      <PageLayout
        heroMedia={
          <MarketingArtwork page="/analytics" isCompact kind="research" />
        }
        heroActions={
          <AgentFirstActions
            signUpHref={signUpHref}
            signUpLabel="Create now"
            trackingName="analytics_hero_click"
          />
        }
        heroVisual={HERO_VISUAL}
        compact
        title="Analytics"
        description="Review available publishing performance and plan your next brief."
      >
        {/* Highlight Card */}
        <section className="gsap-section max-w-4xl mx-auto pb-16 px-6">
          <div className="border border-[var(--gen-accent-border)] bg-[var(--gen-accent-bg)] p-8">
            <div className="flex flex-col items-center gap-8 md:flex-row">
              <div className="flex-shrink-0">
                <div className="flex size-20 items-center justify-center border border-[var(--gen-accent-border)] bg-[var(--gen-accent-tint)]">
                  <ChartColumn className="size-10 text-surface" />
                </div>
              </div>
              <div className="flex w-full min-w-0 flex-col gap-3">
                <Heading as="h3" className="text-2xl font-bold">
                  Learn From Your Published Content
                </Heading>
                <Text as="p" className="text-surface/65">
                  Compare available views and engagement across your posts and
                  brands. Use that context to choose the next format, hook or
                  campaign brief.
                </Text>
              </div>
            </div>
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
          <div className="grid grid-cols-2 gap-1.5 md:grid-cols-4">
            {STEPS.map((step) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.label}
                  className="gen-contact-sheet flex flex-col items-center gap-3 bg-fill/[0.02] p-6 text-center"
                >
                  <div className="flex size-14 items-center justify-center border border-[var(--gen-accent-border)] bg-[var(--gen-accent-bg)]">
                    <Icon className="size-6 text-[color:hsl(var(--gen-accent))]" />
                  </div>
                  <Text as="p" className="text-lg font-bold text-surface">
                    {step.label}
                  </Text>
                </div>
              );
            })}
          </div>
        </section>

        {/* Pricing CTA */}
        <section className="max-w-4xl mx-auto pb-16 px-6">
          <div className="border border-[var(--gen-accent-border)] bg-[var(--gen-accent-bg)] p-6 sm:p-12 text-center">
            <div className="flex justify-center mb-4">
              <Sparkles className="size-8 text-surface" />
            </div>
            <Heading as="h3" className="text-2xl font-bold mb-6 text-surface">
              Know What Works. Do More.
            </Heading>
            <PricingStrip className="mb-6" />
            <div className="flex flex-row items-center flex-wrap gap-4 justify-center">
              <AgentFirstActions
                signUpHref={signUpHref}
                signUpLabel="Create now"
                trackingName="analytics_cta_click"
              />
            </div>
          </div>
        </section>
      </PageLayout>
    </MarketingEntrance>
  );
}
