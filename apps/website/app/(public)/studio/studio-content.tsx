'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { useMarketingEntrance } from '@hooks/ui/use-marketing-entrance';
import type { PublicModelCatalogItem } from '@public/models/models-loader';
import StudioInterfacePreview from '@public/studio/studio-interface-preview';
import ButtonTracked from '@ui/buttons/tracked/ButtonTracked';
import HeroProofRail from '@ui/marketing/HeroProofRail';
import PricingStrip from '@ui/marketing/PricingStrip';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import { HOME_OUTPUT_CAROUSEL_ASSETS } from '@web-components/home/_assets';
import PageLayout from '@web-components/PageLayout';
import {
  ArrowRight,
  ImageIcon,
  Music,
  PencilLine,
  Rocket,
  Sparkles,
  Video,
  Wand,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

const METRICS = [
  {
    after: '2 minutes',
    before: '10+ hours',
    label: 'Video Creation',
  },
  {
    after: 'One platform',
    before: '$500+/mo',
    label: 'Tool Costs',
  },
  {
    after: 'One workspace',
    before: 'Multiple tools',
    label: 'Workflow',
  },
];

const SHOWCASE_OUTPUTS = HOME_OUTPUT_CAROUSEL_ASSETS.slice(0, 5);

const FEATURES = [
  {
    description:
      'Create short-form clips, campaign footage, and finished video from a brief or reference.',
    icon: Video,
    title: 'Video Generation',
  },
  {
    description:
      'Generate campaign stills, product imagery, and design variations in every required ratio.',
    icon: ImageIcon,
    title: 'Image Generation',
  },
  {
    description:
      'Create spoken tracks, voiceovers, music, and audio packages in the same production flow.',
    icon: Music,
    title: 'Voice & Music',
  },
];

const STEPS = [
  {
    icon: PencilLine,
    label: 'Describe',
    sublabel: 'Write a prompt or upload a reference',
  },
  {
    icon: Wand,
    label: 'Generate',
    sublabel: 'AI creates your content in seconds',
  },
  {
    icon: Sparkles,
    label: 'Enhance',
    sublabel: 'Upscale, edit, and refine the output',
  },
  {
    icon: Rocket,
    label: 'Publish',
    sublabel: 'Export or post directly to platforms',
  },
];

const HERO_PROOF = (
  <HeroProofRail
    items={METRICS.map((metric) => ({
      label: metric.label,
      value: (
        <>
          <span className="text-foreground/40 line-through">
            {metric.before}
          </span>{' '}
          {'->'} {metric.after}
        </>
      ),
    }))}
    title="Operational shift"
  />
);

interface StudioContentProps {
  models: PublicModelCatalogItem[] | null;
}

function titleCase(value: string): string {
  return value
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

export default function StudioContent({ models }: StudioContentProps) {
  const containerRef = useMarketingEntrance();
  const categories = [...new Set(models?.map((model) => model.category) ?? [])];
  const heroVisual = <StudioInterfacePreview models={models} />;

  return (
    <div ref={containerRef}>
      <PageLayout
        heroActions={
          <>
            <ButtonTracked
              asChild
              size={ButtonSize.PUBLIC}
              trackingName="studio_hero_click"
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
              trackingName="studio_hero_click"
              trackingData={{ action: 'explore_demo' }}
            >
              <Link href="/demo">Explore Demo</Link>
            </ButtonTracked>
          </>
        }
        heroProof={HERO_PROOF}
        heroVisual={heroVisual}
        compact
        title="Studio"
        description="Create AI content in minutes, not hours."
      >
        <section className="gsap-section mx-auto max-w-6xl px-6 pb-28">
          <div className="grid gap-12 border-y border-edge/10 py-14 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-24 lg:py-20">
            <div>
              <Text className="text-xs font-bold uppercase tracking-[0.16em] text-surface/55">
                Live model catalog
              </Text>
              <Heading
                as="h2"
                className="mt-5 text-4xl font-semibold leading-[1.02] tracking-[-0.045em] text-surface sm:text-5xl"
              >
                Choose the output. Then choose the model.
              </Heading>
            </div>
            <div className="flex flex-col justify-between gap-10">
              <Text className="max-w-xl text-base leading-7 text-surface/68">
                The Studio reads model availability from the same registry as
                the app. New options appear here without rewriting the page or
                publishing stale claims.
              </Text>
              <div className="flex flex-col items-start gap-8">
                {models && models.length > 0 ? (
                  <div className="flex flex-wrap gap-x-6 gap-y-3">
                    {categories.map((category) => (
                      <Text
                        className="text-xs font-bold uppercase tracking-[0.12em] text-surface/50"
                        key={category}
                      >
                        {titleCase(category)}
                      </Text>
                    ))}
                  </div>
                ) : (
                  <Text className="text-sm text-surface/50">
                    {models
                      ? 'No public models are currently listed'
                      : 'Catalog connection unavailable'}
                  </Text>
                )}
                <Link
                  className="inline-flex items-center gap-2 text-sm font-semibold text-surface underline underline-offset-4"
                  href="/models"
                >
                  View the live catalog
                  <ArrowRight className="size-4" />
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 pb-28">
          <div className="mb-10 max-w-2xl">
            <Text className="text-xs font-bold uppercase tracking-[0.16em] text-surface/55">
              Made in Genfeed
            </Text>
            <Heading
              as="h2"
              className="mt-5 text-4xl font-semibold tracking-[-0.04em] text-surface sm:text-5xl"
            >
              Output before interface.
            </Heading>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
            {SHOWCASE_OUTPUTS.map((output, index) => (
              <figure
                key={output.alt}
                className={`relative overflow-hidden rounded-lg bg-card ${
                  index === 0
                    ? 'col-span-2 aspect-[4/5] sm:col-span-4 sm:row-span-2 sm:aspect-auto'
                    : 'col-span-1 aspect-[4/5] sm:col-span-2'
                }`}
              >
                <Image
                  src={output.src}
                  alt={output.alt}
                  fill
                  sizes={
                    index === 0
                      ? '(max-width: 640px) 100vw, 760px'
                      : '(max-width: 640px) 50vw, 360px'
                  }
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                <figcaption className="absolute inset-x-0 bottom-0 p-5">
                  <Text className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/70">
                    {output.format}
                  </Text>
                  <Heading as="h3" className="mt-2 text-xl text-white">
                    {output.title}
                  </Heading>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

        {/* Features Grid */}
        <section className="gsap-section max-w-6xl mx-auto pb-28 px-6">
          <Heading as="h2" className="text-3xl font-semibold mb-10">
            Create across formats
          </Heading>
          <div className="gsap-grid grid grid-cols-1 border-t border-edge/10 md:grid-cols-3">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="gsap-card border-b border-edge/10 py-8 md:border-r md:px-8 md:first:pl-0 md:last:border-r-0 md:last:pr-0"
                >
                  <Icon className="size-5 text-[color:hsl(var(--gen-accent))]" />
                  <Heading as="h3" className="mt-5 font-semibold text-surface">
                    {feature.title}
                  </Heading>
                  <Text className="mt-3 text-sm leading-6 text-surface/65">
                    {feature.description}
                  </Text>
                </div>
              );
            })}
          </div>
        </section>

        {/* How It Works */}
        <section className="gsap-section max-w-4xl mx-auto pb-28 px-6">
          <Heading as="h2" className="text-2xl font-bold text-center mb-12">
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
            <Heading as="h2" className="text-2xl font-bold mb-2 text-surface">
              Start Creating Today
            </Heading>
            <Text as="p" className="text-surface/70 mb-6 max-w-lg mx-auto">
              Generate video, images, audio, and written content from one
              production workspace.
            </Text>
            <PricingStrip className="mb-6" />
            <div className="flex flex-row items-center flex-wrap gap-4 justify-center">
              <ButtonTracked
                asChild
                size={ButtonSize.PUBLIC}
                trackingName="studio_cta_click"
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
                trackingName="studio_cta_click"
                trackingData={{ action: 'explore_studio' }}
              >
                <Link href="/demo">
                  <ArrowRight className="size-4" />
                  Explore Studio
                </Link>
              </ButtonTracked>
            </div>
          </div>
        </section>
      </PageLayout>
    </div>
  );
}
