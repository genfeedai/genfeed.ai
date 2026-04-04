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
import Image from 'next/image';
import Link from 'next/link';
import {
  HiMusicalNote,
  HiPhoto,
  HiSparkles,
  HiVideoCamera,
} from 'react-icons/hi2';
import { LuArrowRight, LuPencilLine, LuRocket, LuWand } from 'react-icons/lu';

const AI_MODELS = [
  'Google Veo 3',
  'Imagen 4',
  'Sora 2',
  'DALL-E',
  'GPT Image',
  'ElevenLabs',
  'Replicate',
];

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

const SHOWCASE_IMAGES = [
  {
    alt: 'AI-generated abstract art',
    src: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&q=80&fit=crop',
  },
  {
    alt: 'AI-generated portrait',
    src: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&q=80&fit=crop',
  },
  {
    alt: 'AI-generated cinematic scene',
    src: 'https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?w=400&q=80&fit=crop',
  },
];

const FEATURES = [
  {
    description:
      'Create videos in 2 minutes with Google Veo 3, OpenAI Sora 2, and more.',
    icon: HiVideoCamera,
    title: 'Video Generation',
  },
  {
    description:
      'Generate images with Google Imagen 4, DALL-E, and GPT Image models.',
    icon: HiPhoto,
    title: 'Image Generation',
  },
  {
    description:
      'AI voice cloning with ElevenLabs and music generation for complete audio.',
    icon: HiMusicalNote,
    title: 'Voice & Music',
  },
];

const STEPS = [
  {
    icon: LuPencilLine,
    label: 'Describe',
    sublabel: 'Write a prompt or upload a reference',
  },
  {
    icon: LuWand,
    label: 'Generate',
    sublabel: 'AI creates your content in seconds',
  },
  {
    icon: HiSparkles,
    label: 'Enhance',
    sublabel: 'Upscale, edit, and refine the output',
  },
  {
    icon: LuRocket,
    label: 'Publish',
    sublabel: 'Export or post directly to platforms',
  },
];

const HIGHLIGHT_TAGS = ['Video', 'Images', 'Voice', 'Music'];

export default function StudioContent() {
  const containerRef = useMarketingEntrance();

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
                <LuArrowRight className="h-4 w-4" />
              </Link>
            </ButtonTracked>
            <ButtonTracked
              asChild
              variant={ButtonVariant.OUTLINE}
              size={ButtonSize.PUBLIC}
              trackingName="studio_hero_click"
              trackingData={{ action: 'explore_demo' }}
            >
              <Link href="/demo">Explore Demo</Link>
            </ButtonTracked>
          </>
        }
        heroProof={
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
        }
        heroVisual={
          <EditorialPoster
            detail="Video, image, voice, and music generation all live inside one production workspace."
            eyebrow="Studio Canvas"
            footer={<span>Models live inside one system</span>}
            items={[
              {
                label: 'Models',
                value: AI_MODELS.slice(0, 4).join(' / '),
              },
              {
                label: 'Formats',
                value: 'Videos, images, voice, music, and export packs.',
              },
              {
                label: 'Workflow',
                value: 'Prompt -> generate -> enhance -> publish.',
              },
              {
                label: 'Outcome',
                value: 'Create faster without juggling subscriptions or tabs.',
              },
            ]}
            subtitle="Generation, refinement, and packaging"
            title={
              <>
                One workspace
                <br />
                for every AI
                <br />
                content format.
              </>
            }
          />
        }
        title="Studio"
        description="Create AI content in minutes, not hours."
      >
        {/* Highlight Card */}
        <section className="gsap-section max-w-4xl mx-auto pb-16 px-6">
          <div className="p-8 border border-[var(--gen-accent-border)] bg-gradient-to-r from-[var(--gen-accent-bg)] to-transparent">
            <HStack className="flex-col md:flex-row items-center gap-8">
              <div className="flex-shrink-0">
                <div className="w-20 h-20 flex items-center justify-center bg-[hsl(var(--gen-accent))]">
                  <HiSparkles className="h-10 w-10 text-inv-fg" />
                </div>
              </div>
              <VStack className="gap-3">
                <Heading as="h3" className="text-2xl font-bold">
                  Every AI Model, One Workspace
                </Heading>
                <Text as="p" className="text-surface/50">
                  Access video, image, voice, and music generation from a single
                  interface. Switch between Google Veo 3, Imagen 4, Sora 2, and
                  more without juggling subscriptions or tabs.
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

        {/* Creative Showcase */}
        <section className="max-w-4xl mx-auto pb-16 px-6">
          <div className="grid grid-cols-3 gap-1.5">
            {SHOWCASE_IMAGES.map((img) => (
              <div
                key={img.alt}
                className="aspect-[9/16] relative overflow-hidden gen-contact-sheet"
              >
                <Image
                  src={img.src}
                  alt={img.alt}
                  fill
                  sizes="(max-width: 768px) 33vw, 25vw"
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                <div className="absolute inset-0 mix-blend-multiply bg-[var(--gen-accent-tint)]" />
              </div>
            ))}
          </div>
        </section>

        {/* Features Grid */}
        <section className="gsap-section max-w-6xl mx-auto pb-16 px-6">
          <Heading as="h3" className="text-2xl font-bold text-center mb-8">
            Everything You Need to Create
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
          <Heading as="h3" className="text-2xl font-bold text-center mb-12">
            How It Works
          </Heading>
          <div className="space-y-0">
            {STEPS.map((step, index) => {
              const Icon = step.icon;
              return (
                <div key={step.label}>
                  <HStack className="items-center gap-6 py-6">
                    <div className="flex-shrink-0 w-14 h-14 flex items-center justify-center border border-[var(--gen-accent-border)] bg-[var(--gen-accent-bg)]">
                      <Icon className="h-6 w-6 text-[color:hsl(var(--gen-accent))]" />
                    </div>
                    <VStack className="gap-1">
                      <Text className="text-lg font-bold text-surface/90">
                        {step.label}
                      </Text>
                      <Text className="text-sm text-surface/40">
                        {step.sublabel}
                      </Text>
                    </VStack>
                  </HStack>
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
          <div className="text-center p-12 bg-[hsl(var(--gen-accent))] shadow-[var(--shadow-glow-md)]">
            <div className="flex justify-center mb-4">
              <HiSparkles className="h-8 w-8 text-inv-fg" />
            </div>
            <Heading as="h3" className="text-2xl font-bold mb-2 text-inv-fg">
              Start Creating Today
            </Heading>
            <Text as="p" className="text-inv-fg/60 mb-6 max-w-lg mx-auto">
              Generate professional videos, images, and audio with the best AI
              models. No editing skills required.
            </Text>
            <PricingStrip inverted className="mb-6" />
            <HStack className="flex-wrap gap-4 justify-center">
              <ButtonTracked
                asChild
                size={ButtonSize.PUBLIC}
                className="bg-inv-fg text-[color:hsl(var(--gen-accent))] hover:bg-inv-fg/80 px-8 py-3 text-xs font-bold uppercase tracking-wider"
                trackingName="studio_cta_click"
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
                trackingName="studio_cta_click"
                trackingData={{ action: 'explore_studio' }}
              >
                <Link href="/demo">
                  <LuArrowRight className="h-4 w-4" />
                  Explore Studio
                </Link>
              </ButtonTracked>
            </HStack>
          </div>
        </section>
      </PageLayout>
    </div>
  );
}
