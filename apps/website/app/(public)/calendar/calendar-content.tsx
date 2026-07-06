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
  HiArrowPath,
  HiCalendarDays,
  HiCheckCircle,
  HiClock,
  HiQueueList,
  HiSparkles,
} from 'react-icons/hi2';

const CALENDLY_URL = EnvironmentService.calendly;

const SHOWCASE_IMAGES = [
  {
    alt: 'Content calendar grid view',
    src: 'https://images.unsplash.com/photo-1506784983877-45594efa4cbe?w=400&q=80&fit=crop',
  },
  {
    alt: 'Scheduled posts pipeline',
    src: 'https://images.unsplash.com/photo-1611224923853-80b023f02d71?w=400&q=80&fit=crop',
  },
  {
    alt: 'Approval workflow review',
    src: 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=400&q=80&fit=crop',
  },
];

const FEATURES = [
  {
    description:
      'Drag and drop drafts onto any day, across every connected channel, from one shared calendar.',
    icon: HiCalendarDays,
    title: 'Visual Calendar View',
  },
  {
    description:
      'Schedule a week or a quarter of posts at once instead of queuing each platform one by one.',
    icon: HiClock,
    title: 'Schedule Every Channel',
  },
  {
    description:
      'Spot gaps and cadence at a glance, then auto-schedule new drafts straight from workflows.',
    icon: HiArrowPath,
    title: 'Cadence & Auto-Schedule',
  },
];

const STEPS = [
  {
    icon: HiQueueList,
    label: 'Plan',
    sublabel: 'Lay out drafts across the calendar by channel',
  },
  {
    icon: HiClock,
    label: 'Schedule',
    sublabel: 'Drag posts into place and set send times',
  },
  {
    icon: HiCheckCircle,
    label: 'Approve',
    sublabel: 'Review and sign off before anything goes out',
  },
  {
    icon: HiSparkles,
    label: 'Publish',
    sublabel: 'Send approved posts out to every platform',
  },
];

const HIGHLIGHT_TAGS = ['Drafts', 'Scheduled', 'Approved', 'Published'];

const HERO_VISUAL = (
  <EditorialPoster
    detail="Every draft, scheduled post, and approval lives on one calendar so nothing slips through the cracks."
    eyebrow="Calendar Canvas"
    footer={<span>Drafts move to scheduled to published</span>}
    items={[
      {
        label: 'View',
        value: 'A single drag-and-drop calendar across every channel.',
      },
      {
        label: 'Pipeline',
        value: 'Drafts, scheduled, and published in one clear status.',
      },
      {
        label: 'Automation',
        value: 'Auto-schedule new drafts straight from workflows.',
      },
      {
        label: 'Outcome',
        value: 'See gaps and cadence before you ever miss a post.',
      },
    ]}
    subtitle="Planning, scheduling, and approvals"
    title="Your calendar, one view."
  />
);

export default function CalendarContent() {
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
              trackingName="calendar_hero_click"
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
              trackingName="calendar_hero_click"
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
        title="Calendar"
        description="Plan and schedule your content, across every channel."
      >
        {/* Highlight Card */}
        <section className="gsap-section max-w-4xl mx-auto pb-16 px-6">
          <div className="p-8 border border-[var(--gen-accent-border)] bg-white/[0.04]">
            <HStack className="flex-col md:flex-row items-center gap-8">
              <div className="flex-shrink-0">
                <div className="size-20 flex items-center justify-center border border-[var(--gen-accent-border)] bg-white/[0.06]">
                  <HiCalendarDays className="size-10 text-surface" />
                </div>
              </div>
              <VStack className="gap-3">
                <Heading as="h3" className="text-2xl font-bold">
                  One Calendar, Every Channel
                </Heading>
                <Text as="p" className="text-surface/65">
                  Plan drafts, schedule posts, and route approvals from a single
                  visual calendar. See exactly what is going out, on which
                  channel, and when, before it ever publishes.
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

        {/* Calendar Showcase */}
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
            Everything You Need to Plan Ahead
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
          <Text className="text-sm text-surface/65 text-center mt-8">
            Once it is approved here, publish it everywhere from the{' '}
            <Link
              href="/publisher"
              className="text-[var(--gen-accent-text)] underline underline-offset-4"
            >
              Publisher
            </Link>
            .
          </Text>
        </section>

        {/* Pricing CTA */}
        <section className="max-w-4xl mx-auto pb-16 px-6">
          <div className="text-center p-12 border border-[var(--gen-accent-border)] bg-white/[0.04]">
            <div className="flex justify-center mb-4">
              <HiCalendarDays className="size-8 text-surface" />
            </div>
            <Heading as="h3" className="text-2xl font-bold mb-2 text-surface">
              Start Planning Today
            </Heading>
            <Text as="p" className="text-surface/70 mb-6 max-w-lg mx-auto">
              Build a content calendar that plans, schedules, and approves
              itself, then publishes everywhere on time.
            </Text>
            <PricingStrip className="mb-6" />
            <HStack className="flex-wrap gap-4 justify-center">
              <ButtonTracked
                asChild
                size={ButtonSize.PUBLIC}
                trackingName="calendar_cta_click"
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
                trackingName="calendar_cta_click"
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
