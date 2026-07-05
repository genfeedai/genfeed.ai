'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { useMarketingEntrance } from '@hooks/ui/use-marketing-entrance';
import { EnvironmentService } from '@services/core/environment.service';
import ButtonTracked from '@ui/buttons/tracked/ButtonTracked';
import { HStack, VStack } from '@ui/layout/stack';
import EditorialPoster from '@ui/marketing/EditorialPoster';
import PricingStrip from '@ui/marketing/PricingStrip';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import PageLayout from '@web-components/PageLayout';
import Image from 'next/image';
import Link from 'next/link';
import {
  HiFolderOpen,
  HiRectangleStack,
  HiSparkles,
  HiSquares2X2,
  HiSwatch,
} from 'react-icons/hi2';
import { LuFolderInput, LuLibraryBig, LuSave, LuWand } from 'react-icons/lu';

const CALENDLY_URL =
  process.env.NEXT_PUBLIC_CALENDLY_URL ||
  'https://calendly.com/vincent-genfeed/30min';

const ASSET_TYPES = [
  'Images',
  'Videos',
  'Voices',
  'Music',
  'Captions',
  'Gifs',
  'Moodboards',
  'Avatars',
];

const SHOWCASE_IMAGES = [
  {
    alt: 'Saved brand image asset',
    src: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&q=80&fit=crop',
  },
  {
    alt: 'Saved brand video asset',
    src: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&q=80&fit=crop',
  },
  {
    alt: 'Saved brand moodboard asset',
    src: 'https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?w=400&q=80&fit=crop',
  },
];

const FEATURES = [
  {
    description:
      'Store logos, colors, fonts, and voice references once, then reuse them across every generation.',
    icon: HiSwatch,
    title: 'Reusable Brand Kits',
  },
  {
    description:
      'Every image, video, and voice you generate is auto-saved and searchable, nothing gets lost.',
    icon: HiRectangleStack,
    title: 'Auto-Saved Outputs',
  },
  {
    description:
      'Collect references into moodboards to art-direct new generations toward a consistent look.',
    icon: HiSquares2X2,
    title: 'Moodboards',
  },
  {
    description:
      'Every asset is shared and versioned across your team, so the whole org works from one source.',
    icon: HiFolderOpen,
    title: 'Team-Shared & Versioned',
  },
];

const STEPS = [
  {
    icon: LuWand,
    label: 'Generate',
    sublabel: 'Create images, video, voice, and more in the studio',
  },
  {
    icon: LuSave,
    label: 'Save',
    sublabel: 'Every output lands in your library automatically',
  },
  {
    icon: LuFolderInput,
    label: 'Organize',
    sublabel: 'Group assets into brand kits and moodboards',
  },
  {
    icon: LuLibraryBig,
    label: 'Reuse',
    sublabel: 'Pull saved assets into any future generation',
  },
];

const HIGHLIGHT_TAGS = ['Images', 'Video', 'Voice', 'Music', 'Moodboards'];

const HERO_VISUAL = (
  <EditorialPoster
    detail="Ingredients, images, videos, voices, music, captions, gifs, moodboards, and avatars all saved in one searchable library."
    eyebrow="Library Canvas"
    footer={<span>Every asset lives in one system</span>}
    items={[
      {
        label: 'Assets',
        value: ASSET_TYPES.slice(0, 4).join(' / '),
      },
      {
        label: 'Formats',
        value: 'Images, video, voice, music, captions, and moodboards.',
      },
      {
        label: 'Workflow',
        value: 'Generate -> save -> organize -> reuse.',
      },
      {
        label: 'Outcome',
        value: 'Reuse what already works instead of recreating it.',
      },
    ]}
    subtitle="Every asset your team creates"
    title={
      <>
        One library
        <br />
        your whole
        <br />
        team reuses.
      </>
    }
  />
);

export default function LibraryContent() {
  const containerRef = useMarketingEntrance();

  return (
    <div ref={containerRef}>
      <PageLayout
        heroActions={
          <>
            <ButtonTracked
              asChild
              size={ButtonSize.PUBLIC}
              trackingName="library_hero_click"
              trackingData={{ action: 'sign_up' }}
            >
              <Link href={`${EnvironmentService.apps.app}/sign-up?plan=payg`}>
                Create now
              </Link>
            </ButtonTracked>
            <ButtonTracked
              asChild
              variant={ButtonVariant.OUTLINE}
              size={ButtonSize.PUBLIC}
              trackingName="library_hero_click"
              trackingData={{ action: 'book_demo' }}
            >
              <Link
                href={CALENDLY_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                Book a Demo
              </Link>
            </ButtonTracked>
          </>
        }
        heroVisual={HERO_VISUAL}
        compact
        title="Library"
        description="One shared library your whole team reuses."
      >
        {/* Highlight Card */}
        <section className="gsap-section max-w-4xl mx-auto pb-16 px-6">
          <div className="p-8 border border-[var(--gen-accent-border)] bg-gradient-to-r from-[var(--gen-accent-bg)] to-transparent">
            <HStack className="flex-col md:flex-row items-center gap-8">
              <div className="flex-shrink-0">
                <div className="size-20 flex items-center justify-center bg-[hsl(var(--gen-accent))]">
                  <HiRectangleStack className="size-10 text-inv-fg" />
                </div>
              </div>
              <VStack className="gap-3">
                <Heading as="h3" className="text-2xl font-bold">
                  Every Asset, One Library
                </Heading>
                <Text as="p" className="text-surface/50">
                  Ingredients, images, videos, voices, music, captions, gifs,
                  moodboards, and avatars all saved in one place. Stop
                  recreating what already works and start reusing it.
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

        {/* Asset Showcase */}
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
            Everything Stays Within Reach
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
                    <div className="size-12 flex items-center justify-center border border-[var(--gen-accent-border)] bg-[var(--gen-accent-bg)]">
                      <Icon className="size-6 text-[color:hsl(var(--gen-accent))]" />
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
                    <div className="flex-shrink-0 size-14 flex items-center justify-center border border-[var(--gen-accent-border)] bg-[var(--gen-accent-bg)]">
                      <Icon className="size-6 text-[color:hsl(var(--gen-accent))]" />
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
          <div className="text-center p-12 bg-[hsl(var(--gen-accent))]">
            <div className="flex justify-center mb-4">
              <HiSparkles className="size-8 text-inv-fg" />
            </div>
            <Heading as="h3" className="text-2xl font-bold mb-2 text-inv-fg">
              Build Your Library Today
            </Heading>
            <Text as="p" className="text-inv-fg/60 mb-6 max-w-lg mx-auto">
              Save every asset your team creates and reuse it across brands,
              campaigns, and channels. No manual organizing required.
            </Text>
            <PricingStrip inverted className="mb-6" />
            <HStack className="flex-wrap gap-4 justify-center">
              <ButtonTracked
                asChild
                size={ButtonSize.PUBLIC}
                className="bg-inv-fg text-[color:hsl(var(--gen-accent))] hover:bg-inv-fg/80 px-8 py-3 text-xs font-bold uppercase tracking-wider"
                trackingName="library_cta_click"
                trackingData={{ action: 'sign_up' }}
              >
                <Link href={`${EnvironmentService.apps.app}/sign-up?plan=payg`}>
                  Create now
                </Link>
              </ButtonTracked>
              <ButtonTracked
                asChild
                variant={ButtonVariant.OUTLINE}
                size={ButtonSize.PUBLIC}
                className="border-inv-fg/20 text-inv-fg hover:bg-inv-fg/5 px-8 py-3 text-xs font-bold uppercase tracking-wider"
                trackingName="library_cta_click"
                trackingData={{ action: 'book_demo' }}
              >
                <Link
                  href={CALENDLY_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
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
