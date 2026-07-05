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
import {
  HiArrowTrendingUp,
  HiEye,
  HiLightBulb,
  HiMagnifyingGlass,
  HiMegaphone,
  HiSparkles,
} from 'react-icons/hi2';

const CALENDLY_URL = EnvironmentService.calendly;

const SHOWCASE_IMAGES = [
  {
    alt: 'Trending social content feed',
    src: 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=400&q=80&fit=crop',
  },
  {
    alt: 'Competitor ad creative library',
    src: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=400&q=80&fit=crop',
  },
  {
    alt: 'Trend to brief workflow',
    src: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=400&q=80&fit=crop',
  },
];

const FEATURES = [
  {
    description:
      'See what is trending right now, with the hooks and formats driving engagement.',
    icon: HiArrowTrendingUp,
    title: 'Trend Discovery Feed',
  },
  {
    description:
      'Watch competitor social accounts and get notified when their content takes off.',
    icon: HiEye,
    title: 'Competitor Social Tracking',
  },
  {
    description:
      'Browse a searchable library of winning ad creative across platforms and niches.',
    icon: HiMegaphone,
    title: 'Ad Creative Library',
  },
];

const STEPS = [
  {
    icon: HiMagnifyingGlass,
    label: 'Discover',
    sublabel: 'Surface trending content and hooks as they emerge',
  },
  {
    icon: HiEye,
    label: 'Track',
    sublabel: 'Follow competitor accounts and winning ad creative',
  },
  {
    icon: HiArrowTrendingUp,
    label: 'Analyze',
    sublabel: 'Understand why a trend or ad is working',
  },
  {
    icon: HiLightBulb,
    label: 'Brief',
    sublabel: 'Turn the insight into a ready brief in one click',
  },
];

const HIGHLIGHT_TAGS = ['Discovery', 'Socials', 'Ads', 'Briefs'];

const HERO_VISUAL = (
  <EditorialPoster
    detail="Trend discovery, competitor tracking, and ad creative research all live inside one research workspace."
    eyebrow="Research Canvas"
    footer={<span>Signal turns into a brief in one click</span>}
    items={[
      {
        label: 'Sources',
        value: 'Trending posts, competitor socials, and ad libraries.',
      },
      {
        label: 'Formats',
        value: 'Hooks, creative angles, and full campaign references.',
      },
      {
        label: 'Workflow',
        value: 'Discover -> track -> analyze -> brief.',
      },
      {
        label: 'Outcome',
        value: 'Find what is working now before it fades.',
      },
    ]}
    subtitle="Discovery, tracking, and briefing"
    title="Find what's working now."
  />
);

export default function ResearchContent() {
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
              trackingName="research_hero_click"
              trackingData={{ action: 'create_now' }}
            >
              <a href={signUpHref} target="_blank" rel="noopener noreferrer">
                Create now
              </a>
            </ButtonTracked>
            <ButtonTracked
              asChild
              variant={ButtonVariant.OUTLINE}
              size={ButtonSize.PUBLIC}
              trackingName="research_hero_click"
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
        title="Research"
        description="Find trends, track competitors, and turn signal into a brief."
      >
        {/* Highlight Card */}
        <section className="gsap-section max-w-4xl mx-auto pb-16 px-6">
          <div className="p-8 border border-[var(--gen-accent-border)] bg-white/[0.04]">
            <HStack className="flex-col md:flex-row items-center gap-8">
              <div className="flex-shrink-0">
                <div className="size-20 flex items-center justify-center border border-[var(--gen-accent-border)] bg-white/[0.06]">
                  <HiSparkles className="size-10 text-surface" />
                </div>
              </div>
              <VStack className="gap-3">
                <Heading as="h3" className="text-2xl font-bold">
                  Every Signal, One Workspace
                </Heading>
                <Text as="p" className="text-surface/65">
                  Track trending content, competitor social accounts, and
                  winning ad creative from a single interface. Turn any
                  discovery into a ready brief without switching tabs.
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

        {/* Trend Showcase */}
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
            Everything You Need to Discover
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
                  <HStack className="items-center gap-6 py-6">
                    <div className="flex-shrink-0 size-14 flex items-center justify-center border border-[var(--gen-accent-border)] bg-[var(--gen-accent-bg)]">
                      <Icon className="size-6 text-[color:hsl(var(--gen-accent))]" />
                    </div>
                    <VStack className="gap-1">
                      <Text className="text-lg font-bold text-surface">
                        {step.label}
                      </Text>
                      <Text className="text-sm text-surface/65">
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
          <div className="text-center p-12 border border-[var(--gen-accent-border)] bg-white/[0.04]">
            <div className="flex justify-center mb-4">
              <HiSparkles className="size-8 text-surface" />
            </div>
            <Heading as="h3" className="text-2xl font-bold mb-2 text-surface">
              Start Discovering Today
            </Heading>
            <Text as="p" className="text-surface/70 mb-6 max-w-lg mx-auto">
              Find trends, track competitors, and study winning ad creative.
              Turn every discovery into a ready brief in one click.
            </Text>
            <PricingStrip className="mb-6" />
            <HStack className="flex-wrap gap-4 justify-center">
              <ButtonTracked
                asChild
                size={ButtonSize.PUBLIC}
                trackingName="research_cta_click"
                trackingData={{ action: 'create_now' }}
              >
                <a href={signUpHref} target="_blank" rel="noopener noreferrer">
                  Create now
                </a>
              </ButtonTracked>
              <ButtonTracked
                asChild
                variant={ButtonVariant.OUTLINE}
                size={ButtonSize.PUBLIC}
                trackingName="research_cta_click"
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
            </HStack>
          </div>
        </section>
      </PageLayout>
    </div>
  );
}
