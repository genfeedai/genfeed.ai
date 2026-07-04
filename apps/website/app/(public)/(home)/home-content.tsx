'use client';

import { FAQ_ITEMS_CORE } from '@data/faq.data';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { websitePlans } from '@helpers/business/pricing/pricing.helper';
import { cn } from '@helpers/formatting/cn/cn.util';
import { EnvironmentService } from '@services/core/environment.service';
import ButtonTracked from '@ui/buttons/tracked/ButtonTracked';
import { HStack, VStack } from '@ui/layout/stack';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@ui/primitives/accordion';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import HomeFooter from '@web-components/home/_footer';
import Image from 'next/image';
import Link from 'next/link';
import { HiBuildingOffice2, HiCloud, HiUser } from 'react-icons/hi2';
import { LuArrowRight, LuCheck } from 'react-icons/lu';

interface HeroMetric {
  label: string;
  value: string;
}

interface HowStep {
  description: string;
  step: string;
  title: string;
}

interface ExampleCampaign {
  caption: string;
  handle: string;
  likes: string;
  status: string;
}

interface AudienceBenefit {
  label: string;
}

const CALENDLY_URL =
  process.env.NEXT_PUBLIC_CALENDLY_URL ||
  'https://calendly.com/vincent-genfeed/30min';

const EYEBROW_CLASS =
  'text-xs font-bold uppercase tracking-widest text-surface/65';

const HERO_METRICS: HeroMetric[] = [
  { label: 'generated for launch', value: '42 assets' },
  { label: 'covered in one pass', value: '9 channels' },
  { label: 'estimated output cost', value: '$184' },
  { label: 'best hook rate', value: '31%' },
];

const HERO_OUTCOMES: HeroMetric[] = [
  { label: 'from one campaign brief', value: 'Every format' },
  { label: 'usage-based generation', value: 'Lower cost' },
  { label: 'post-generation KPI readout', value: 'Performance loop' },
];

const HOW_STEPS: HowStep[] = [
  {
    description:
      'Describe the campaign, brand, or product. One prompt sets the direction for everything that follows.',
    step: '01',
    title: 'Start from a brief',
  },
  {
    description:
      'Images, reels, ads, articles, captions, voice, and clips — produced from that single brief, on brand.',
    step: '02',
    title: 'Generate every format',
  },
  {
    description:
      'Ship across every channel, then see which posts and ads actually drove results.',
    step: '03',
    title: 'Publish and track',
  },
];

const EXAMPLE_CAMPAIGNS: ExampleCampaign[] = [
  {
    caption:
      'Tokyo midnight drop for a travel client. Approved, captioned, and scheduled before breakfast.',
    handle: 'kai.travels',
    likes: '21,503',
    status: 'Client approved',
  },
  {
    caption:
      'Fashion creator pack generated from one brief with brand-safe styling locked in.',
    handle: 'nova.styles',
    likes: '18,240',
    status: 'Ready to publish',
  },
  {
    caption:
      'Beauty vertical for a client launch. Hooks, variants, and KPI tracking already queued.',
    handle: 'aria.digital',
    likes: '27,991',
    status: 'Tracking live',
  },
];

const CREATOR_BENEFITS: AudienceBenefit[] = [
  { label: '10x your output — three posts a week becomes thirty' },
  { label: 'Save 15+ hours a week you used to spend editing' },
  { label: 'Track revenue per post, not just likes' },
];

const AGENCY_BENEFITS: AudienceBenefit[] = [
  { label: 'Spin up ad creative and variations at volume for every campaign' },
  { label: 'A dedicated workspace and approval flow per client' },
  { label: 'Show clients exactly which creative drove sales' },
];

const PAYG_EXPLAINERS = [
  'No bundled output quota to decode',
  'Videos, images, and voice are usage-based',
  'Premium models are managed by Genfeed',
] as const;

const PLAN_ORDER = ['Hosted', 'Cloud Teams', 'Enterprise'] as const;

function formatPlanPrice(price: number | null): string {
  if (price === null) {
    return 'Custom';
  }

  return `$${price.toLocaleString()}`;
}

function getPlan(label: (typeof PLAN_ORDER)[number]) {
  const plan = websitePlans.find((item) => item.label === label);

  if (!plan) {
    throw new Error(`Missing homepage pricing plan: ${label}`);
  }

  return plan;
}

function HomeHero(): React.ReactElement {
  const signUpHref = `${EnvironmentService.apps.app}/sign-up?plan=hosted`;

  return (
    <section className="relative overflow-hidden border-b border-edge/5 bg-background">
      <div className="container mx-auto px-6">
        <div className="grid min-h-[calc(100svh-5.5rem)] items-center gap-12 py-14 lg:grid-cols-[minmax(0,0.74fr)_minmax(560px,1.26fr)] lg:gap-16 lg:py-16 xl:gap-20">
          <div className="max-w-[42rem] self-center">
            <Heading
              as="h1"
              className="hero-headline max-w-[42rem] text-5xl font-semibold leading-[0.95] tracking-[-0.03em] text-surface sm:text-6xl md:text-7xl xl:text-[5.3rem]"
            >
              Generate everything you publish.
            </Heading>

            <Text
              as="p"
              className="hero-description mt-6 max-w-xl text-base leading-7 text-surface/72 md:text-lg"
            >
              One brief becomes the full internet campaign: images, reels, ads,
              articles, captions, newsletters, voice, clips, and the readout
              that tells you what worked.
            </Text>

            <HStack className="mt-8 flex-wrap gap-3">
              <ButtonTracked
                asChild
                size={ButtonSize.PUBLIC}
                className="hero-cta shadow-[var(--shadow-glow-md)]"
                trackingData={{ action: 'signup_cloud_app_hero' }}
                trackingName="hero_cta_click"
              >
                <a href={signUpHref} rel="noopener noreferrer" target="_blank">
                  Sign up
                  <LuArrowRight className="size-4" />
                </a>
              </ButtonTracked>

              <ButtonTracked
                asChild
                className="hero-cta"
                size={ButtonSize.PUBLIC}
                trackingData={{ action: 'book_demo_hero' }}
                trackingName="hero_cta_click"
                variant={ButtonVariant.OUTLINE}
              >
                <a
                  href={CALENDLY_URL}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Book a demo
                </a>
              </ButtonTracked>
            </HStack>

            <div className="hero-cta mt-9 grid max-w-xl grid-cols-1 overflow-hidden rounded-md bg-edge/10 shadow-border sm:grid-cols-3">
              {HERO_OUTCOMES.map((metric) => (
                <div
                  key={metric.value}
                  className="min-h-24 border-b border-edge/5 bg-card px-4 py-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"
                >
                  <p className="text-sm font-semibold tracking-[-0.02em] text-surface">
                    {metric.value}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-surface/58">
                    {metric.label}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <figure
            className="hero-output-wall relative mx-auto w-full max-w-[860px]"
            data-testid="home-hero-output-wall"
          >
            <div className="relative overflow-hidden rounded-lg bg-card shadow-border-strong">
              <Image
                alt="A premium Genfeed output wall showing generated images, video frames, audio clips, ads, articles, and social carousel assets"
                className="h-auto w-full object-cover"
                width={1693}
                height={929}
                priority
                sizes="(max-width: 1024px) 100vw, 860px"
                src="/images/home/generated-output-wall.png"
              />
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_54%,rgba(5,6,7,0.82))]" />
            </div>

            <div className="relative z-10 mx-3 -mt-12 grid overflow-hidden rounded-md bg-edge/10 shadow-border-strong sm:grid-cols-4 lg:mx-8">
              {HERO_METRICS.map((metric) => (
                <div
                  key={metric.value}
                  className="border-b border-edge/5 bg-background/95 px-4 py-3 backdrop-blur last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0"
                >
                  <p className="text-sm font-semibold tracking-[-0.02em] text-surface">
                    {metric.value}
                  </p>
                  <p className="mt-1 text-[11px] leading-4 text-surface/55">
                    {metric.label}
                  </p>
                </div>
              ))}
            </div>
          </figure>
        </div>
      </div>
    </section>
  );
}

function HomeHowItWorks(): React.ReactElement {
  return (
    <section id="how" className="gen-section-spacing-lg border-b border-edge/5">
      <div className="container mx-auto px-6">
        <VStack className="mb-10 max-w-3xl gap-4">
          <Text className={EYEBROW_CLASS}>How it works</Text>
          <Heading
            as="h2"
            className="text-4xl font-semibold leading-tight tracking-[-0.03em] sm:text-5xl"
          >
            From one brief to everything you publish.
          </Heading>
          <Text className="max-w-2xl text-base leading-7 gen-text-muted">
            Three steps. No tool-switching, no production bottleneck between the
            idea and the post.
          </Text>
        </VStack>

        <div className="grid grid-cols-1 gap-px bg-edge/5 sm:grid-cols-3">
          {HOW_STEPS.map((item) => (
            <div
              key={item.step}
              className="flex flex-col gap-3 bg-background p-8"
            >
              <Text className="text-sm font-black tracking-[-0.02em] text-surface/30">
                {item.step}
              </Text>
              <Heading as="h3" className="text-xl font-semibold text-surface">
                {item.title}
              </Heading>
              <Text className="text-sm leading-6 text-surface/70">
                {item.description}
              </Text>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HomeProof(): React.ReactElement {
  return (
    <section
      id="work"
      className="gen-section-spacing-lg border-b border-edge/5"
    >
      <div className="container mx-auto px-6">
        <VStack className="mb-10 max-w-3xl gap-4">
          <Text className={EYEBROW_CLASS}>The workflow</Text>
          <Heading
            as="h2"
            className="text-4xl font-semibold leading-tight tracking-[-0.03em] sm:text-5xl"
          >
            Brand-safe, approval-ready, and tracked.
          </Heading>
          <Text className="max-w-2xl text-base leading-7 gen-text-muted">
            Example campaigns generated in Genfeed — from brief to
            client-approved, with performance tracking already queued.
          </Text>
        </VStack>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {EXAMPLE_CAMPAIGNS.map((campaign) => (
            <div
              key={campaign.handle}
              className="flex flex-col gap-4 border border-edge/5 bg-card p-5"
            >
              <HStack className="items-center justify-between">
                <HStack className="items-center gap-3">
                  <div className="flex size-9 items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--gen-accent-1,#6366f1),var(--gen-accent-2,#ec4899))] text-sm font-bold text-white">
                    {campaign.handle.charAt(0).toUpperCase()}
                  </div>
                  <VStack className="gap-0">
                    <Text className="text-sm font-semibold text-surface">
                      {campaign.handle}
                    </Text>
                    <Text className="text-[11px] leading-4 text-surface/58">
                      Instagram
                    </Text>
                  </VStack>
                </HStack>
                <HStack className="items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1">
                  <span className="size-1.5 rounded-full bg-success" />
                  <Text className="text-[11px] font-medium text-success">
                    {campaign.status}
                  </Text>
                </HStack>
              </HStack>

              <Text className="text-sm leading-6 text-surface/72">
                {campaign.caption}
              </Text>

              <HStack className="items-center gap-2 border-t border-edge/5 pt-3 text-xs text-surface/58">
                <Text className="font-semibold text-surface/72">
                  {campaign.likes}
                </Text>
                <Text>likes</Text>
                <Text className="text-surface/25">·</Text>
                <Text>#AIContent #Genfeed</Text>
              </HStack>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HomeAudiences(): React.ReactElement {
  const signUpHref = `${EnvironmentService.apps.app}/sign-up?plan=hosted`;

  return (
    <section
      id="audiences"
      className="gen-section-spacing-lg border-b border-edge/5"
    >
      <div className="container mx-auto px-6">
        <VStack className="mb-12 max-w-3xl gap-4">
          <Text className={EYEBROW_CLASS}>Who it&apos;s for</Text>
          <Heading
            as="h2"
            className="text-4xl font-semibold leading-tight tracking-[-0.03em] sm:text-5xl"
          >
            Built for solo creators — and the agencies who scale them.
          </Heading>
          <Text className="max-w-2xl text-base leading-7 gen-text-muted">
            Start self-serve as a creator, or bring your whole client roster and
            let AI run the creative volume.
          </Text>
        </VStack>

        <div className="grid grid-cols-1 gap-px bg-edge/5 lg:grid-cols-2">
          <div className="flex flex-col gap-5 bg-background p-8">
            <HStack className="items-center gap-2 text-surface/72">
              <HiUser className="size-4" />
              <Text className={EYEBROW_CLASS}>Solo creators</Text>
            </HStack>
            <Heading as="h3" className="text-2xl font-semibold text-surface">
              Post daily without a team.
            </Heading>
            <ul className="flex flex-col gap-3">
              {CREATOR_BENEFITS.map((benefit) => (
                <li key={benefit.label} className="flex items-start gap-3">
                  <LuCheck className="mt-0.5 size-4 shrink-0 text-success" />
                  <Text className="text-sm leading-6 text-surface/72">
                    {benefit.label}
                  </Text>
                </li>
              ))}
            </ul>
            <Text className="text-xs leading-5 text-surface/60">
              Cloud App · $49/mo + pay for the output you generate
            </Text>
            <HStack className="mt-auto flex-wrap items-center gap-4 pt-2">
              <ButtonTracked
                asChild
                size={ButtonSize.PUBLIC}
                trackingData={{ action: 'signup_creators_audience' }}
                trackingName="audience_cta_click"
              >
                <a href={signUpHref} rel="noopener noreferrer" target="_blank">
                  Sign up
                  <LuArrowRight className="size-4" />
                </a>
              </ButtonTracked>
              <Link
                href="/use-cases/creators"
                className="text-sm font-medium text-surface/72 underline-offset-4 hover:text-surface hover:underline"
              >
                Genfeed for creators →
              </Link>
            </HStack>
          </div>

          <div className="flex flex-col gap-5 bg-white/[0.04] p-8">
            <HStack className="items-center justify-between">
              <HStack className="items-center gap-2 text-surface/72">
                <HiBuildingOffice2 className="size-4" />
                <Text className={EYEBROW_CLASS}>
                  Agencies &amp; paid social
                </Text>
              </HStack>
              <HStack className="items-center gap-1.5 rounded-full bg-surface/10 px-2.5 py-1">
                <Text className="text-[11px] font-semibold uppercase tracking-wider text-surface/70">
                  Talk to us
                </Text>
              </HStack>
            </HStack>
            <Heading as="h3" className="text-2xl font-semibold text-surface">
              Run every client&apos;s creative from one place.
            </Heading>
            <ul className="flex flex-col gap-3">
              {AGENCY_BENEFITS.map((benefit) => (
                <li key={benefit.label} className="flex items-start gap-3">
                  <LuCheck className="mt-0.5 size-4 shrink-0 text-success" />
                  <Text className="text-sm leading-6 text-surface/72">
                    {benefit.label}
                  </Text>
                </li>
              ))}
            </ul>
            <Text className="text-xs leading-5 text-surface/60">
              Cloud Teams · multi-client workspaces, approvals, managed billing
            </Text>
            <HStack className="mt-auto flex-wrap items-center gap-4 pt-2">
              <ButtonTracked
                asChild
                size={ButtonSize.PUBLIC}
                trackingData={{ action: 'book_demo_agencies_audience' }}
                trackingName="audience_cta_click"
              >
                <a
                  href={CALENDLY_URL}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Book a demo
                  <LuArrowRight className="size-4" />
                </a>
              </ButtonTracked>
              <Link
                href="/use-cases/agencies"
                className="text-sm font-medium text-surface/72 underline-offset-4 hover:text-surface hover:underline"
              >
                Genfeed for agencies →
              </Link>
            </HStack>
          </div>
        </div>
      </div>
    </section>
  );
}

function HomePricing(): React.ReactElement {
  const signUpHref = `${EnvironmentService.apps.app}/sign-up?plan=hosted`;

  return (
    <section
      id="pricing"
      className="gen-section-spacing-lg border-b border-edge/5"
    >
      <div className="container mx-auto px-6">
        <div className="mb-12 grid gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(320px,0.55fr)] lg:items-end">
          <VStack className="gap-4">
            <Heading
              as="h2"
              className="max-w-3xl text-4xl font-semibold leading-tight tracking-[-0.03em] sm:text-5xl"
            >
              Pay for access. Then pay for what you create.
            </Heading>
            <Text className="max-w-2xl text-base leading-7 gen-text-muted">
              Start with managed Genfeed, then scale into paid seats, approvals,
              multi-organization workflows, and managed billing when your
              content operation grows.
            </Text>
          </VStack>

          <div className="border border-edge/5 p-5">
            <VStack className="gap-4">
              {PAYG_EXPLAINERS.map((item) => (
                <HStack key={item} className="items-start gap-3">
                  <LuCheck className="mt-0.5 size-4 shrink-0 text-success" />
                  <Text className="text-sm leading-6 text-surface/72">
                    {item}
                  </Text>
                </HStack>
              ))}
            </VStack>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-px bg-edge/5 lg:grid-cols-3">
          {PLAN_ORDER.map((label) => {
            const plan = getPlan(label);
            const isCloudApp = plan.label === 'Hosted';
            const isTeamCloud = plan.label === 'Cloud Teams';
            const priceQualifier =
              plan.type === 'payg'
                ? '/month platform access + PAYG output'
                : plan.price === null
                  ? 'Custom pricing'
                  : '/month + PAYG output';
            const ctaHref = isCloudApp
              ? signUpHref
              : plan.ctaHref || CALENDLY_URL;
            const ctaLabel = isCloudApp ? 'Sign up' : plan.cta;

            return (
              <div
                key={plan.label}
                className={cn(
                  'flex flex-col gap-5 bg-background p-6',
                  isCloudApp && 'bg-white/[0.04]',
                )}
              >
                <VStack className="gap-2">
                  <HStack
                    className={cn(
                      'items-center gap-2 text-xs font-bold uppercase tracking-widest',
                      isCloudApp ? 'text-surface/72' : 'text-surface/35',
                    )}
                  >
                    {isTeamCloud ? (
                      <HiBuildingOffice2 className="size-4" />
                    ) : (
                      <HiCloud className="size-4" />
                    )}
                    <Text>{isCloudApp ? 'Cloud App' : plan.label}</Text>
                  </HStack>

                  <Heading as="h3" className="text-3xl font-black text-surface">
                    {formatPlanPrice(plan.price)}
                  </Heading>
                  <Text className="text-xs leading-5 text-surface/60">
                    {priceQualifier}
                  </Text>
                </VStack>

                <Text className="text-sm leading-6 text-surface/70">
                  {isCloudApp
                    ? 'Managed Genfeed for founders and creators who want the app without operating infrastructure.'
                    : plan.valueProposition || plan.description}
                </Text>

                <div className="h-px bg-edge/5" />

                <ul className="flex-1 space-y-2">
                  {plan.features.slice(0, 4).map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <LuCheck className="mt-0.5 size-3.5 shrink-0 text-surface/30" />
                      <Text className="text-xs leading-5 text-surface/65">
                        {feature}
                      </Text>
                    </li>
                  ))}
                </ul>

                <ButtonTracked
                  asChild
                  className="w-full justify-center"
                  size={ButtonSize.PUBLIC}
                  trackingData={{ plan: plan.label.toLowerCase() }}
                  trackingName="pricing_plan_click"
                  variant={ButtonVariant.OUTLINE}
                >
                  <a href={ctaHref} rel="noopener noreferrer" target="_blank">
                    {ctaLabel}
                    <LuArrowRight className="size-3" />
                  </a>
                </ButtonTracked>
              </div>
            );
          })}
        </div>

        <HStack className="mt-10 flex-wrap items-center justify-center gap-4">
          <ButtonTracked
            asChild
            size={ButtonSize.PUBLIC}
            trackingName="pricing_view_full_click"
            variant={ButtonVariant.OUTLINE}
          >
            <Link href="/pricing">
              Compare Plans
              <LuArrowRight className="size-3" />
            </Link>
          </ButtonTracked>
          <ButtonTracked
            asChild
            size={ButtonSize.PUBLIC}
            trackingData={{ action: 'book_demo_pricing' }}
            trackingName="pricing_demo_click"
            variant={ButtonVariant.OUTLINE}
          >
            <a href={CALENDLY_URL} rel="noopener noreferrer" target="_blank">
              Book a demo
            </a>
          </ButtonTracked>
        </HStack>
      </div>
    </section>
  );
}

function HomeFAQ(): React.ReactElement {
  return (
    <section id="faq" className="gen-section-spacing-lg border-b border-edge/5">
      <div className="container mx-auto max-w-3xl px-6">
        <VStack className="mb-8 gap-4">
          <Text className={EYEBROW_CLASS}>FAQ</Text>
          <Heading
            as="h2"
            className="text-4xl font-semibold leading-tight tracking-[-0.03em] sm:text-5xl"
          >
            Questions, answered.
          </Heading>
        </VStack>

        <Accordion type="single" collapsible className="space-y-3">
          {FAQ_ITEMS_CORE.map((item) => (
            <AccordionItem
              key={item.question}
              value={item.question}
              className="border border-edge/5 px-4"
            >
              <AccordionTrigger className="py-4 text-left text-base font-medium hover:no-underline">
                {item.question}
              </AccordionTrigger>
              <AccordionContent className="pb-4 leading-relaxed text-surface/72">
                {item.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        <HStack className="mt-8">
          <ButtonTracked
            asChild
            size={ButtonSize.PUBLIC}
            trackingName="faq_view_all_click"
            variant={ButtonVariant.OUTLINE}
          >
            <Link href="/faq">
              See all FAQs
              <LuArrowRight className="size-3" />
            </Link>
          </ButtonTracked>
        </HStack>
      </div>
    </section>
  );
}

function HomeCTA(): React.ReactElement {
  const signUpHref = `${EnvironmentService.apps.app}/sign-up?plan=hosted`;

  return (
    <section className="gen-section-spacing-xl relative overflow-hidden gen-grain">
      <div className="container mx-auto px-6 relative z-10">
        <VStack className="items-center text-center gap-8 max-w-3xl mx-auto">
          <Heading
            as="h2"
            className="text-5xl font-semibold leading-none tracking-[-0.03em] sm:text-6xl md:text-7xl"
          >
            Start creating in minutes.
          </Heading>

          <Text
            as="p"
            className="text-lg md:text-xl gen-text-muted max-w-xl leading-relaxed"
          >
            Sign up and turn one brief into a full campaign — images, video,
            voice, and copy. Book a demo if you&apos;re rolling this out across
            a team or client roster.
          </Text>

          <HStack className="flex-wrap justify-center gap-3">
            <ButtonTracked
              asChild
              size={ButtonSize.PUBLIC}
              trackingData={{ action: 'signup_bottom_cta' }}
              trackingName="cta_final_click"
            >
              <a href={signUpHref} target="_blank" rel="noopener noreferrer">
                Sign up
                <LuArrowRight className="size-4" />
              </a>
            </ButtonTracked>

            <ButtonTracked
              asChild
              size={ButtonSize.PUBLIC}
              trackingData={{ action: 'book_demo_bottom_cta' }}
              trackingName="cta_final_click"
              variant={ButtonVariant.OUTLINE}
            >
              <a href={CALENDLY_URL} target="_blank" rel="noopener noreferrer">
                Book a demo
              </a>
            </ButtonTracked>
          </HStack>
        </VStack>
      </div>
    </section>
  );
}

export default function HomeContent() {
  return (
    <>
      <HomeHero />
      <HomeHowItWorks />
      <HomeProof />
      <HomeAudiences />
      <HomePricing />
      <HomeFAQ />
      <HomeCTA />
      <HomeFooter />
    </>
  );
}
