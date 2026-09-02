'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { useMarketingEntrance } from '@hooks/ui/use-marketing-entrance';
import ButtonTracked from '@ui/buttons/tracked/ButtonTracked';
import HeroProofRail from '@ui/marketing/HeroProofRail';
import PricingStrip from '@ui/marketing/PricingStrip';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import PageLayout from '@web-components/PageLayout';
import ProductInterfacePreview from '@web-components/product/ProductInterfacePreview';
import {
  ArrowRight,
  Box,
  LayoutGrid,
  RefreshCw,
  Rocket,
  Scan,
  Settings,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import Link from 'next/link';

const BEFORE_AFTER = [
  {
    after: 'Inspectable in seconds',
    before: 'Hidden execution',
    label: 'Execution Visibility',
  },
  {
    after: 'Exact step control',
    before: 'Loose prompt chains',
    label: 'Logic Definition',
  },
  {
    after: 'Agent-triggered, user-controlled',
    before: 'All-or-nothing autonomy',
    label: 'Agent Relationship',
  },
];

const HIGHLIGHT_TAGS = [
  'Deterministic',
  'Inspectable',
  'Scheduled',
  'Agent-Triggered',
];

const NODE_CATEGORIES = [
  {
    count: '8+',
    description: 'Text, image, video, URL, schedule, and webhook starts',
    name: 'Input Nodes',
  },
  {
    count: '12+',
    description:
      'LLM, vision, image generation, video generation, voice, music',
    name: 'AI Nodes',
  },
  {
    count: '10+',
    description: 'Transform, filter, merge, split, resize, rate, and gate',
    name: 'Processing',
  },
  {
    count: '8+',
    description: 'Publish, Schedule, Queue, Email, Notify',
    name: 'Distribution',
  },
  {
    count: '7',
    description:
      'Brand, Persona, Asset, Content Plan, Photo Session, Video, Publish',
    name: 'SaaS Nodes',
  },
];

const FEATURES = [
  {
    description:
      'Define every generation, review, approval, and publishing step explicitly instead of relying on hidden agent behavior.',
    icon: LayoutGrid,
    title: 'Deterministic Steps',
  },
  {
    description:
      'Inspect every handoff, trigger, and output on the canvas so you can understand exactly why the workflow ran.',
    icon: Scan,
    title: 'Inspectable Execution',
  },
  {
    description:
      'Let agents trigger workflows while you keep control of the steps, conditions, quality gates, and schedules.',
    icon: ShieldCheck,
    title: 'User-Controlled Automation',
  },
];

const HOW_IT_WORKS = [
  {
    description: 'Define every node, branch, and quality gate on the canvas',
    icon: Box,
    label: 'Author',
  },
  {
    description:
      'Connect outputs, inputs, and conditions so execution stays deterministic',
    icon: RefreshCw,
    label: 'Wire',
  },
  {
    description:
      'Choose manual starts, schedules, or events, then let agents trigger the workflow when appropriate',
    icon: Settings,
    label: 'Trigger',
  },
  {
    description:
      'Run autonomous systems with explicit execution control, retries, and inspectable outputs',
    icon: Rocket,
    label: 'Operate',
  },
];

const HERO_PROOF_ITEMS = BEFORE_AFTER.map((item) => ({
  label: item.label,
  value: (
    <>
      <span className="text-foreground/40 line-through">{item.before}</span>{' '}
      {'->'} {item.after}
    </>
  ),
}));

const HERO_PROOF = (
  <HeroProofRail items={HERO_PROOF_ITEMS} title="Why deterministic wins" />
);

const HERO_VISUAL = (
  <ProductInterfacePreview
    product={{
      category: 'Automation',
      features: FEATURES,
      headline: 'Build, inspect, and run deterministic content systems.',
      name: 'Workflows',
      useCases: HOW_IT_WORKS.map((step) => ({
        description: step.description,
        title: step.label,
      })),
    }}
  />
);

export default function WorkflowsContent() {
  const containerRef = useMarketingEntrance();

  return (
    <div ref={containerRef}>
      <PageLayout
        heroActions={
          <>
            <ButtonTracked
              asChild
              size={ButtonSize.PUBLIC}
              trackingName="workflows_hero_click"
              trackingData={{ action: 'core_cta' }}
            >
              <Link href="/pricing">
                Open Core
                <ArrowRight className="size-4" />
              </Link>
            </ButtonTracked>
            <ButtonTracked
              asChild
              variant={ButtonVariant.SECONDARY}
              size={ButtonSize.PUBLIC}
              trackingName="workflows_hero_click"
              trackingData={{ action: 'explore_studio' }}
            >
              <Link href="/studio">See Studio</Link>
            </ButtonTracked>
          </>
        }
        heroProof={HERO_PROOF}
        heroVisual={HERO_VISUAL}
        compact
        title="Workflows"
        description="Deterministic workflow control for agentic execution."
      >
        {/* Highlight Card */}
        <section className="max-w-4xl mx-auto pb-16 px-6">
          <div className="border border-[var(--gen-accent-border)] bg-[var(--gen-accent-bg)] p-8">
            <div className="flex flex-row flex-col md:flex-row items-center gap-8">
              <div className="flex-shrink-0">
                <div className="flex size-20 items-center justify-center border border-[var(--gen-accent-border)] bg-[var(--gen-accent-tint)]">
                  <LayoutGrid className="size-10 text-surface" />
                </div>
              </div>
              <div className="flex flex-col gap-3">
                <Heading as="h3" className="text-2xl font-bold">
                  Deterministic Workflows for Agentic Systems
                </Heading>
                <Text as="p" className="text-surface/65">
                  Author the exact execution path yourself. Agents can trigger
                  the workflow, but the triggers, steps, branches, ratings, and
                  publishing logic stay explicit and inspectable.
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

        {/* Node Categories */}
        <section className="gsap-section max-w-6xl mx-auto pb-16 px-6">
          <Heading as="h3" className="text-2xl font-bold text-center mb-8">
            Node Library
          </Heading>
          {/* Row 1: 3 cards */}
          <div className="gsap-grid grid grid-cols-1 md:grid-cols-3 gap-1.5 mb-1.5">
            {NODE_CATEGORIES.slice(0, 3).map((category) => (
              <div
                key={category.name}
                className="gsap-card gen-card-spotlight p-6"
              >
                <Text className="text-2xl font-bold text-[color:hsl(var(--gen-accent))] mb-1">
                  {category.count}
                </Text>
                <Heading as="h4" className="font-semibold text-surface mb-2">
                  {category.name}
                </Heading>
                <Text className="text-sm text-surface/65">
                  {category.description}
                </Text>
              </div>
            ))}
          </div>
          {/* Row 2: 2 cards centered */}
          <div className="gsap-grid grid grid-cols-1 md:grid-cols-2 gap-1.5 max-w-2xl mx-auto">
            {NODE_CATEGORIES.slice(3).map((category) => (
              <div
                key={category.name}
                className="gsap-card gen-card-spotlight p-6"
              >
                <Text className="text-2xl font-bold text-[color:hsl(var(--gen-accent))] mb-1">
                  {category.count}
                </Text>
                <Heading as="h4" className="font-semibold text-surface mb-2">
                  {category.name}
                </Heading>
                <Text className="text-sm text-surface/65">
                  {category.description}
                </Text>
              </div>
            ))}
          </div>
        </section>

        {/* Features Grid */}
        <section className="gsap-section max-w-6xl mx-auto pb-16 px-6">
          <Heading as="h3" className="text-2xl font-bold text-center mb-8">
            Why Workflows
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
          <Heading as="h3" className="text-2xl font-bold text-center mb-8">
            How It Works
          </Heading>
          <div className="space-y-0">
            {HOW_IT_WORKS.map((step, index) => {
              const Icon = step.icon;
              return (
                <div key={step.label}>
                  <div className="flex flex-row items-center gap-6 py-6">
                    <div className="flex-shrink-0 size-14 flex items-center justify-center border border-[var(--gen-accent-border)] bg-[var(--gen-accent-bg)]">
                      <Icon className="size-6 text-[color:hsl(var(--gen-accent))]" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Heading as="h4" className="text-lg font-bold">
                        {step.label}
                      </Heading>
                      <Text className="text-sm text-surface/65">
                        {step.description}
                      </Text>
                    </div>
                  </div>
                  {index < HOW_IT_WORKS.length - 1 && (
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
              <LayoutGrid className="size-8 text-surface" />
            </div>
            <Heading as="h3" className="text-2xl font-bold mb-2 text-surface">
              Use Agents for Simplicity. Use Workflows for Control.
            </Heading>
            <Text as="p" className="text-surface/70 mb-6 max-w-lg mx-auto">
              Let agents trigger autonomous runs, or configure every trigger and
              step yourself when you need deterministic execution from idea to
              published output.
            </Text>
            <PricingStrip className="mb-6" />
            <div className="flex flex-row items-center flex-wrap gap-4 justify-center">
              <ButtonTracked
                asChild
                size={ButtonSize.PUBLIC}
                trackingName="workflows_cta_click"
                trackingData={{ action: 'view_plans' }}
              >
                <Link href="/pricing">
                  View Plans
                  <ArrowRight className="size-4" />
                </Link>
              </ButtonTracked>
              <ButtonTracked
                asChild
                variant={ButtonVariant.SECONDARY}
                size={ButtonSize.PUBLIC}
                trackingName="workflows_cta_click"
                trackingData={{ action: 'book_demo' }}
              >
                <Link href="/demo">
                  <Zap className="size-4" />
                  Book a Demo
                </Link>
              </ButtonTracked>
            </div>
          </div>
        </section>
      </PageLayout>
    </div>
  );
}
