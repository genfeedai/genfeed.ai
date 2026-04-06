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
import { FaInstagram, FaTiktok, FaYoutube } from 'react-icons/fa6';
import {
  HiBell,
  HiBolt,
  HiChartBar,
  HiClock,
  HiCurrencyDollar,
  HiRocketLaunch,
  HiSparkles,
  HiVideoCamera,
} from 'react-icons/hi2';
import { LuArrowRight, LuPencil } from 'react-icons/lu';

const PAIN_POINTS = [
  {
    icon: HiClock,
    problem: 'Hours per video',
    solution: 'Minutes with AI',
  },
  {
    icon: HiChartBar,
    problem: 'Missing trends',
    solution: 'Real-time alerts',
  },
  {
    icon: HiCurrencyDollar,
    problem: 'Expensive editors',
    solution: 'Built-in everything',
  },
];

const FEATURES = [
  {
    description:
      'Get notified when topics in your niche start trending. Post before the wave peaks.',
    icon: HiBell,
    title: 'Trend Alerts',
  },
  {
    description:
      'Generate videos, images, and captions in minutes. No editing skills required.',
    icon: HiBolt,
    title: 'Quick Edits',
  },
  {
    description:
      'Post to TikTok, YouTube, Instagram, and more from one dashboard.',
    icon: HiRocketLaunch,
    title: 'Multi-Platform Publish',
  },
];

const TESTIMONIALS = [
  {
    avatar: 'S',
    handle: '@sarahcreates',
    name: 'Sarah M.',
    quote:
      'I went from posting 3 times a week to 3 times a day. My engagement tripled.',
  },
  {
    avatar: 'M',
    handle: '@mikevlogs',
    name: 'Mike R.',
    quote:
      'The trend alerts alone are worth it. I caught a viral trend early and got 2M views.',
  },
  {
    avatar: 'J',
    handle: '@jennatech',
    name: 'Jenna K.',
    quote:
      'Finally feels like I have a whole team behind me. And I can afford it as a solo creator.',
  },
];

const _PLATFORMS = [
  { icon: FaYoutube, name: 'YouTube' },
  { icon: FaTiktok, name: 'TikTok' },
  { icon: FaInstagram, name: 'Instagram' },
];

export default function CreatorsContent() {
  const containerRef = useMarketingEntrance();

  return (
    <div ref={containerRef}>
      <PageLayout
        heroActions={
          <>
            <ButtonTracked
              asChild
              size={ButtonSize.PUBLIC}
              trackingName="creators_hero_click"
              trackingData={{ action: 'core_cta' }}
            >
              <Link href="/core">
                Get Started
                <LuArrowRight className="h-4 w-4" />
              </Link>
            </ButtonTracked>
            <ButtonTracked
              asChild
              variant={ButtonVariant.OUTLINE}
              size={ButtonSize.PUBLIC}
              trackingName="creators_hero_click"
              trackingData={{ action: 'explore_studio' }}
            >
              <Link href="/studio">Explore Studio</Link>
            </ButtonTracked>
          </>
        }
        heroProof={
          <HeroProofRail
            items={PAIN_POINTS.map((item) => ({
              label: item.problem,
              value: item.solution,
            }))}
            title="The shift"
          />
        }
        heroVisual={
          <EditorialPoster
            detail="Turn one idea into clips, captions, and platform-ready variants without spending your week inside an editor."
            eyebrow="Creator Loop"
            footer={<span>YouTube / TikTok / Instagram</span>}
            items={[
              {
                label: 'Trend signal',
                value: 'Spot winning topics before the wave peaks.',
              },
              {
                label: 'Production',
                value: 'Generate videos, images, and captions in minutes.',
              },
              {
                label: 'Distribution',
                value: 'Ship to every platform from one operating view.',
              },
              {
                label: 'Feedback',
                value: 'Track what actually drives revenue, not vanity only.',
              },
            ]}
            subtitle="Output, speed, and revenue clarity"
            title={
              <>
                Create more.
                <br />
                Edit less.
                <br />
                Learn faster.
              </>
            }
          />
        }
        variant="proof"
        title="For Creators"
        description="Create more, edit less. AI tools that help solo creators compete with agencies."
      >
        {/* Video Generation Highlight */}
        <section className="max-w-4xl mx-auto pb-16 px-6">
          <div className="p-8 border border-[var(--gen-accent-border)] bg-gradient-to-r from-[var(--gen-accent-bg)] to-transparent">
            <HStack className="flex-col md:flex-row items-center gap-8">
              <div className="flex-shrink-0">
                <div className="w-20 h-20 flex items-center justify-center bg-[hsl(var(--gen-accent))]">
                  <HiVideoCamera className="h-10 w-10 text-inv-fg" />
                </div>
              </div>
              <VStack className="gap-3">
                <Heading as="h3" className="text-2xl font-bold">
                  Generate Videos in Minutes
                </Heading>
                <Text as="p" className="text-surface/50">
                  Stop spending hours editing. Describe what you want, and AI
                  creates production-ready videos with captions, transitions,
                  and music.
                </Text>
                <HStack className="flex-wrap gap-2">
                  {['Auto-captions', 'Trending music', '1-click export'].map(
                    (tag) => (
                      <span
                        key={tag}
                        className="px-3 py-1 text-xs border border-[var(--gen-accent-border)] text-[var(--gen-accent-text)]"
                      >
                        {tag}
                      </span>
                    ),
                  )}
                </HStack>
              </VStack>
            </HStack>
          </div>

          {/* AI Content Showcase */}
          <div className="grid grid-cols-3 gap-1.5 mt-1.5">
            {[
              {
                alt: 'AI-generated lifestyle portrait',
                src: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=400&q=80&fit=crop',
              },
              {
                alt: 'AI-generated cinematic video',
                src: 'https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?w=400&q=80&fit=crop',
              },
              {
                alt: 'AI-generated abstract art',
                src: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&q=80&fit=crop',
              },
            ].map((img) => (
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

        {/* Features */}
        <section className="gsap-section max-w-6xl mx-auto pb-16 px-6">
          <Heading as="h3" className="text-2xl font-bold text-center mb-8">
            Everything You Need to Go Viral
          </Heading>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-1.5">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.title}
                  className="gen-card-spotlight p-8 bg-fill/[0.02] text-center"
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

        {/* Testimonials */}
        <section className="gsap-section max-w-6xl mx-auto pb-16 px-6">
          <Heading as="h3" className="text-2xl font-bold text-center mb-8">
            Creators Love Genfeed
          </Heading>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-1.5">
            {TESTIMONIALS.map((testimonial) => (
              <div
                key={testimonial.handle}
                className="p-8 border border-[var(--gen-accent-border)] bg-fill/[0.02] hover:border-[var(--gen-accent-hover)] transition-colors"
              >
                <HStack className="items-center gap-3 mb-4">
                  <div className="w-10 h-10 flex items-center justify-center bg-[var(--gen-accent-bg)] border border-[var(--gen-accent-border)]">
                    <Text className="font-bold text-[color:hsl(var(--gen-accent))]">
                      {testimonial.avatar}
                    </Text>
                  </div>
                  <VStack>
                    <Text className="font-semibold text-sm text-surface/80">
                      {testimonial.name}
                    </Text>
                    <Text className="text-xs text-[var(--gen-accent-text)]">
                      {testimonial.handle}
                    </Text>
                  </VStack>
                </HStack>
                <Text className="text-surface/50 italic text-sm leading-relaxed">
                  &ldquo;{testimonial.quote}&rdquo;
                </Text>
              </div>
            ))}
          </div>
        </section>

        {/* Pricing CTA */}
        <section className="max-w-4xl mx-auto pb-16 px-6">
          <div className="text-center p-12 bg-[hsl(var(--gen-accent))] shadow-[var(--shadow-glow-md)]">
            <div className="flex justify-center mb-4">
              <HiSparkles className="h-8 w-8 text-inv-fg" />
            </div>
            <Heading as="h3" className="text-2xl font-bold mb-2 text-inv-fg">
              Start Creating with Core
            </Heading>
            <Text as="p" className="text-inv-fg/60 mb-6 max-w-lg mx-auto">
              Self-host the full platform for free. Bring your own AI keys, no
              limits, forever yours.
            </Text>
            <PricingStrip inverted className="mb-6" />
            <HStack className="flex-wrap gap-4 justify-center">
              <ButtonTracked
                asChild
                size={ButtonSize.PUBLIC}
                className="bg-inv-fg text-[color:hsl(var(--gen-accent))] hover:bg-inv-fg/80 px-8 py-3 text-xs font-bold uppercase tracking-wider"
                trackingName="creators_cta_click"
                trackingData={{ action: 'core_cta' }}
              >
                <Link href="/core">
                  Get Started
                  <LuArrowRight className="h-4 w-4" />
                </Link>
              </ButtonTracked>
              <ButtonTracked
                asChild
                variant={ButtonVariant.OUTLINE}
                size={ButtonSize.PUBLIC}
                className="border-inv-fg/20 text-inv-fg hover:bg-inv-fg/5 px-8 py-3 text-xs font-bold uppercase tracking-wider"
                trackingName="creators_cta_click"
                trackingData={{ action: 'explore_studio' }}
              >
                <Link href="/studio">
                  <LuPencil className="h-4 w-4" />
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
