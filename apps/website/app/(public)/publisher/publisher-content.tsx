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
import { HiBolt, HiClock, HiGlobeAlt, HiRocketLaunch } from 'react-icons/hi2';
import { LuArrowRight, LuCalendar, LuLink, LuSend } from 'react-icons/lu';

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const METRICS = [
  {
    after: '1 dashboard',
    before: '10 apps',
    icon: HiGlobeAlt,
    label: 'Platform Management',
  },
  {
    after: '20 minutes',
    before: '3 hours',
    icon: HiClock,
    label: 'Distribution Time',
  },
  {
    after: 'Perfect consistency',
    before: 'Missed posts',
    icon: HiBolt,
    label: 'Publishing Reliability',
  },
];

const FEATURES = [
  {
    description:
      'Post to X, LinkedIn, Instagram, TikTok, YouTube, Facebook, Pinterest, Reddit, Discord, and Twitch from one composer.',
    icon: HiGlobeAlt,
    title: '10+ Platforms',
  },
  {
    description:
      'Schedule weeks of content in advance. AI recommends best posting times for each platform.',
    icon: HiClock,
    title: 'Smart Scheduling',
  },
  {
    description:
      'Auto-format content for each platform with platform-specific captions, hashtags, and formats.',
    icon: HiBolt,
    title: 'Platform Optimization',
  },
];

const SHOWCASE_IMAGES = [
  {
    alt: 'Publishing dashboard overview',
    src: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=400&q=80&fit=crop',
  },
  {
    alt: 'Social media feed management',
    src: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=400&q=80&fit=crop',
  },
  {
    alt: 'Content analytics dashboard',
    src: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=400&q=80&fit=crop',
  },
];

const WORKFLOW_STEPS = [
  {
    icon: LuLink,
    label: 'Connect',
    sublabel: 'Link your social accounts in one click',
  },
  {
    icon: LuArrowRight,
    label: 'Create',
    sublabel: 'Compose once with AI-powered editing',
  },
  {
    icon: LuCalendar,
    label: 'Schedule',
    sublabel: 'Pick times or let AI choose the best',
  },
  {
    icon: LuSend,
    label: 'Publish',
    sublabel: 'Auto-format and post to every platform',
  },
];

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function PublisherContent() {
  const containerRef = useMarketingEntrance();

  return (
    <div ref={containerRef}>
      <PageLayout
        heroActions={
          <>
            <ButtonTracked
              asChild
              size={ButtonSize.PUBLIC}
              trackingName="publisher_hero_click"
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
              trackingName="publisher_hero_click"
              trackingData={{ action: 'core_cta' }}
            >
              <Link href="/core">Start with Core</Link>
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
            title="What changes"
          />
        }
        heroVisual={
          <EditorialPoster
            detail="Publishing is no longer a copy-paste ritual. Compose once, route everywhere, and keep the channel-level optimization attached."
            eyebrow="Distribution Layer"
            footer={<span>X / LinkedIn / Instagram / TikTok / YouTube</span>}
            items={[
              {
                label: 'Compose once',
                value: 'Write, package, and format in one operating surface.',
              },
              {
                label: 'Optimize',
                value: 'Channel-aware captions, hashtags, and delivery timing.',
              },
              {
                label: 'Schedule',
                value: 'Weeks of content queued from a single production run.',
              },
              {
                label: 'Ship',
                value: 'One command publishes the full distribution plan.',
              },
            ]}
            subtitle="Publishing without tool switching"
            title={
              <>
                Publish everywhere
                <br />
                from one
                <br />
                operating surface.
              </>
            }
          />
        }
        title="Publisher"
        description="Publish your content, everywhere, instantly."
      >
        {/* -------------------------------------------------------- */}
        {/*  Highlight Card                                           */}
        {/* -------------------------------------------------------- */}
        <section className="gsap-hero max-w-4xl mx-auto pb-16 px-6">
          <div className="p-8 border border-[var(--gen-accent-border)] bg-gradient-to-r from-[var(--gen-accent-bg)] to-transparent">
            <HStack className="flex-col md:flex-row items-center gap-8">
              <div className="flex-shrink-0">
                <div className="w-20 h-20 flex items-center justify-center bg-[hsl(var(--gen-accent))]">
                  <HiRocketLaunch className="h-10 w-10 text-inv-fg" />
                </div>
              </div>
              <VStack className="gap-3">
                <Heading as="h3" className="text-2xl font-bold">
                  Publish Everywhere, From One Place
                </Heading>
                <Text as="p" className="text-surface/50">
                  Stop copy-pasting across ten different apps. Write once, let
                  Genfeed auto-format for each platform, schedule the optimal
                  time, and publish everywhere simultaneously.
                </Text>
                <HStack className="flex-wrap gap-2">
                  {['10+ Platforms', 'Smart Scheduling', 'Auto-Format'].map(
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
        </section>

        {/* -------------------------------------------------------- */}
        {/*  Platform Visual Grid                                     */}
        {/* -------------------------------------------------------- */}
        <section className="max-w-4xl mx-auto pb-16 px-6">
          <div className="mb-8">
            <span className="gen-label gen-text-accent">In Action</span>
          </div>
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

        {/* -------------------------------------------------------- */}
        {/*  Features Grid                                            */}
        {/* -------------------------------------------------------- */}
        <section className="gsap-section max-w-6xl mx-auto pb-16 px-6">
          <div className="mb-8">
            <span className="gen-label gen-text-accent">Capabilities</span>
          </div>
          <Heading as="h3" className="text-2xl font-bold mb-8">
            Everything You Need to Publish at Scale
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

        {/* -------------------------------------------------------- */}
        {/*  How It Works                                             */}
        {/* -------------------------------------------------------- */}
        <section className="gsap-section max-w-4xl mx-auto pb-16 px-6">
          <div className="mb-8">
            <span className="gen-label gen-text-accent">Workflow</span>
          </div>
          <Heading as="h3" className="text-2xl font-bold mb-10">
            Four Steps to Everywhere
          </Heading>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-0">
            {WORKFLOW_STEPS.map((step, index) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.label}
                  className="relative flex flex-col items-center text-center px-4 py-6"
                >
                  {/* Divider between steps (not before the first) */}
                  {index > 0 && (
                    <div className="hidden md:block absolute left-0 top-1/2 -translate-y-1/2 h-16 gen-divider-accent" />
                  )}

                  {/* Step number */}
                  <Text className="text-[10px] font-black uppercase tracking-widest text-surface/20 mb-3">
                    Step {index + 1}
                  </Text>

                  {/* Icon */}
                  <div className="w-14 h-14 flex items-center justify-center border border-[var(--gen-accent-border)] bg-[var(--gen-accent-bg)] mb-4">
                    <Icon className="h-6 w-6 text-[color:hsl(var(--gen-accent))]" />
                  </div>

                  {/* Label */}
                  <Heading
                    as="h4"
                    className="font-semibold text-surface/90 mb-1"
                  >
                    {step.label}
                  </Heading>

                  {/* Sublabel */}
                  <Text className="text-xs text-surface/40 leading-relaxed">
                    {step.sublabel}
                  </Text>
                </div>
              );
            })}
          </div>
        </section>

        {/* -------------------------------------------------------- */}
        {/*  Pricing CTA                                              */}
        {/* -------------------------------------------------------- */}
        <section className="max-w-4xl mx-auto pb-16 px-6">
          <div className="text-center p-12 bg-[hsl(var(--gen-accent))] shadow-[var(--shadow-glow-md)]">
            <div className="flex justify-center mb-4">
              <HiRocketLaunch className="h-8 w-8 text-inv-fg" />
            </div>
            <Heading as="h3" className="text-2xl font-bold mb-2 text-inv-fg">
              Start Publishing Today
            </Heading>
            <Text as="p" className="text-inv-fg/60 mb-6 max-w-lg mx-auto">
              Connect your platforms and start publishing AI content everywhere
              in minutes. Free tier available with no credit card required.
            </Text>
            <PricingStrip inverted className="mb-6" />
            <HStack className="flex-wrap gap-4 justify-center">
              <ButtonTracked
                asChild
                size={ButtonSize.PUBLIC}
                className="bg-inv-fg text-[color:hsl(var(--gen-accent))] hover:bg-inv-fg/80 px-8 py-3 text-xs font-bold uppercase tracking-wider"
                trackingName="publisher_cta_click"
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
                trackingName="publisher_cta_click"
                trackingData={{ action: 'book_demo' }}
              >
                <Link href="/demo">Book a Demo</Link>
              </ButtonTracked>
            </HStack>
          </div>
        </section>
      </PageLayout>
    </div>
  );
}
