'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { useMarketingEntrance } from '@hooks/ui/use-marketing-entrance';
import ButtonTracked from '@ui/buttons/tracked/ButtonTracked';
import { HStack, VStack } from '@ui/layout/stack';
import EditorialPoster from '@ui/marketing/EditorialPoster';
import HeroProofRail from '@ui/marketing/HeroProofRail';
import PricingStrip from '@ui/marketing/PricingStrip';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import PageLayout from '@web-components/PageLayout';
import Link from 'next/link';
import {
  HiArrowPath,
  HiBolt,
  HiCog6Tooth,
  HiCube,
  HiRocketLaunch,
  HiShieldCheck,
  HiSquaresPlus,
  HiViewfinderCircle,
} from 'react-icons/hi2';
import { LuArrowRight } from 'react-icons/lu';

const STATS = [
  { label: '44+ Nodes' },
  { label: '7 SaaS Integrations' },
  { label: 'Deterministic Control' },
];

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
    icon: HiSquaresPlus,
    title: 'Deterministic Steps',
  },
  {
    description:
      'Inspect every handoff, trigger, and output on the canvas so you can understand exactly why the workflow ran.',
    icon: HiViewfinderCircle,
    title: 'Inspectable Execution',
  },
  {
    description:
      'Let agents trigger workflows while you keep control of the steps, conditions, quality gates, and schedules.',
    icon: HiShieldCheck,
    title: 'User-Controlled Automation',
  },
];

const HOW_IT_WORKS = [
  {
    description: 'Define every node, branch, and quality gate on the canvas',
    icon: HiCube,
    label: 'Author',
  },
  {
    description:
      'Connect outputs, inputs, and conditions so execution stays deterministic',
    icon: HiArrowPath,
    label: 'Wire',
  },
  {
    description:
      'Choose manual starts, schedules, or events, then let agents trigger the workflow when appropriate',
    icon: HiCog6Tooth,
    label: 'Trigger',
  },
  {
    description:
      'Run autonomous systems with explicit execution control, retries, and inspectable outputs',
    icon: HiRocketLaunch,
    label: 'Operate',
  },
];

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
              <Link href="/core">
                Open Core
                <LuArrowRight className="h-4 w-4" />
              </Link>
            </ButtonTracked>
            <ButtonTracked
              asChild
              variant={ButtonVariant.OUTLINE}
              size={ButtonSize.PUBLIC}
              trackingName="workflows_hero_click"
              trackingData={{ action: 'explore_studio' }}
            >
              <Link href="/studio">See Studio</Link>
            </ButtonTracked>
          </>
        }
        heroProof={
          <HeroProofRail
            items={BEFORE_AFTER.map((item) => ({
              label: item.label,
              value: (
                <>
                  <span className="text-foreground/40 line-through">
                    {item.before}
                  </span>{' '}
                  {'->'} {item.after}
                </>
              ),
            }))}
            title="Why deterministic wins"
          />
        }
        heroVisual={
          <EditorialPoster
            detail="Agents can trigger the run, but the logic stays explicit, inspectable, and schedulable."
            eyebrow="Workflow Canvas"
            footer={<span>{STATS.map((stat) => stat.label).join(' / ')}</span>}
            items={[
              {
                label: 'Author',
                value:
                  'Define each step, branch, gate, and retry path yourself.',
              },
              {
                label: 'Inspect',
                value:
                  'Every input, output, and handoff stays visible on the canvas.',
              },
              {
                label: 'Trigger',
                value:
                  'Manual starts, schedules, events, and agent-triggered runs.',
              },
              {
                label: 'Operate',
                value:
                  'Deterministic execution with human control over the loop.',
              },
            ]}
            subtitle="Deterministic control for agentic systems"
            title={
              <>
                Workflows for
                <br />
                systems that
                <br />
                must stay legible.
              </>
            }
          />
        }
        title="Workflows"
        description="Deterministic workflow control for agentic execution."
      >
        {/* Highlight Card */}
        <section className="max-w-4xl mx-auto pb-16 px-6">
          <div className="p-8 border border-[var(--gen-accent-border)] bg-gradient-to-r from-[var(--gen-accent-bg)] to-transparent">
            <HStack className="flex-col md:flex-row items-center gap-8">
              <div className="flex-shrink-0">
                <div className="w-20 h-20 flex items-center justify-center bg-[hsl(var(--gen-accent))]">
                  <HiSquaresPlus className="h-10 w-10 text-inv-fg" />
                </div>
              </div>
              <VStack className="gap-3">
                <Heading as="h3" className="text-2xl font-bold">
                  Deterministic Workflows for Agentic Systems
                </Heading>
                <Text as="p" className="text-surface/50">
                  Author the exact execution path yourself. Agents can trigger
                  the workflow, but the triggers, steps, branches, ratings, and
                  publishing logic stay explicit and inspectable.
                </Text>
                <HStack className="flex-wrap gap-2">
                  {HIGHLIGHT_TAGS.map((tag) => (
                    <span
                      key={tag}
                      className="px-3 py-1 text-xs border border-[var(--gen-accent-border)] text-[var(--gen-accent-text)]"
                    >
                      {tag}
                    </span>
                  ))}
                </HStack>
              </VStack>
            </HStack>
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
                className="gsap-card gen-card-spotlight p-6 bg-fill/[0.02]"
              >
                <Text className="text-2xl font-bold text-[color:hsl(var(--gen-accent))] mb-1">
                  {category.count}
                </Text>
                <Heading as="h4" className="font-semibold text-surface/90 mb-2">
                  {category.name}
                </Heading>
                <Text className="text-sm text-surface/40">
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
                className="gsap-card gen-card-spotlight p-6 bg-fill/[0.02]"
              >
                <Text className="text-2xl font-bold text-[color:hsl(var(--gen-accent))] mb-1">
                  {category.count}
                </Text>
                <Heading as="h4" className="font-semibold text-surface/90 mb-2">
                  {category.name}
                </Heading>
                <Text className="text-sm text-surface/40">
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
                  className="gsap-card gen-card-spotlight p-8 bg-fill/[0.02] text-center"
                >
                  <div className="flex justify-center mb-4">
                    <div className="w-12 h-12 flex items-center justify-center border border-[var(--gen-accent-border)] bg-[var(--gen-accent-bg)]">
                      <Icon className="h-6 w-6 text-[color:hsl(var(--gen-accent))]" />
                    </div>
                  </div>
                  <Heading
                    as="h4"
                    className="font-semibold mb-2 text-surface/90"
                  >
                    {feature.title}
                  </Heading>
                  <Text className="text-sm text-surface/40">
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
                  <HStack className="items-center gap-6 py-6">
                    <div className="flex-shrink-0 w-14 h-14 flex items-center justify-center border border-[var(--gen-accent-border)] bg-[var(--gen-accent-bg)]">
                      <Icon className="h-6 w-6 text-[color:hsl(var(--gen-accent))]" />
                    </div>
                    <VStack className="gap-1">
                      <Heading as="h4" className="text-lg font-bold">
                        {step.label}
                      </Heading>
                      <Text className="text-sm text-surface/40">
                        {step.description}
                      </Text>
                    </VStack>
                  </HStack>
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
          <div className="text-center p-12 gen-card-featured shadow-[var(--shadow-glow-md)]">
            <div className="flex justify-center mb-4">
              <HiSquaresPlus className="h-8 w-8 text-inv-fg" />
            </div>
            <Heading as="h3" className="text-2xl font-bold mb-2 text-inv-fg">
              Use Agents for Simplicity. Use Workflows for Control.
            </Heading>
            <Text as="p" className="text-inv-fg/60 mb-6 max-w-lg mx-auto">
              Let agents trigger autonomous runs, or configure every trigger and
              step yourself when you need deterministic execution from idea to
              published output.
            </Text>
            <PricingStrip inverted className="mb-6" />
            <HStack className="flex-wrap gap-4 justify-center">
              <ButtonTracked
                asChild
                size={ButtonSize.PUBLIC}
                className="bg-inv-fg text-[color:hsl(var(--gen-accent))] hover:bg-inv-fg/80 px-8 py-3 text-xs font-bold uppercase tracking-wider"
                trackingName="workflows_cta_click"
                trackingData={{ action: 'view_plans' }}
              >
                <Link href="/pricing">
                  View Plans
                  <LuArrowRight className="h-4 w-4" />
                </Link>
              </ButtonTracked>
              <ButtonTracked
                asChild
                variant={ButtonVariant.OUTLINE}
                size={ButtonSize.PUBLIC}
                className="border-inv-fg/20 text-inv-fg hover:bg-inv-fg/5 px-8 py-3 text-xs font-bold uppercase tracking-wider"
                trackingName="workflows_cta_click"
                trackingData={{ action: 'book_demo' }}
              >
                <Link href="/demo">
                  <HiBolt className="h-4 w-4" />
                  Book a Demo
                </Link>
              </ButtonTracked>
            </HStack>
          </div>
        </section>
      </PageLayout>
    </div>
  );
}
