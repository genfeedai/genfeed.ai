'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { websitePlans } from '@helpers/business/pricing/pricing.helper';
import { cn } from '@helpers/formatting/cn/cn.util';
import { EnvironmentService } from '@services/core/environment.service';
import ButtonTracked from '@ui/buttons/tracked/ButtonTracked';
import { HStack, VStack } from '@ui/layout/stack';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import HomeFooter from '@web-components/home/_footer';
import Image from 'next/image';
import Link from 'next/link';
import { HiBuildingOffice2, HiCloud } from 'react-icons/hi2';
import { LuArrowRight, LuCheck } from 'react-icons/lu';

interface HeroMetric {
  label: string;
  value: string;
}

const CALENDLY_URL =
  process.env.NEXT_PUBLIC_CALENDLY_URL ||
  'https://calendly.com/vincent-genfeed/30min';

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
              className="hero-description mt-6 max-w-xl text-base leading-7 text-surface/62 md:text-lg"
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
                  Start Cloud App
                  <LuArrowRight className="size-4" />
                </a>
              </ButtonTracked>

              <ButtonTracked
                asChild
                className="hero-cta"
                size={ButtonSize.PUBLIC}
                trackingData={{ action: 'view_formats_hero' }}
                trackingName="hero_cta_click"
                variant={ButtonVariant.OUTLINE}
              >
                <Link href="#formats">See Formats</Link>
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
                  <p className="mt-1 text-xs leading-5 text-surface/40">
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
                  <p className="mt-1 text-[11px] leading-4 text-surface/38">
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
                  <Text className="text-sm leading-6 text-surface/60">
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
            const ctaLabel = isCloudApp ? 'Start Cloud App' : plan.cta;

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
                      isCloudApp ? 'text-surface/60' : 'text-surface/35',
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
                  <Text className="text-xs leading-5 text-surface/45">
                    {priceQualifier}
                  </Text>
                </VStack>

                <Text className="text-sm leading-6 text-surface/55">
                  {isCloudApp
                    ? 'Managed Genfeed for founders and creators who want the app without operating infrastructure.'
                    : plan.valueProposition || plan.description}
                </Text>

                <div className="h-px bg-edge/5" />

                <ul className="flex-1 space-y-2">
                  {plan.features.slice(0, 4).map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <LuCheck className="mt-0.5 size-3.5 shrink-0 text-surface/30" />
                      <Text className="text-xs leading-5 text-surface/50">
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
              Book a Demo
            </a>
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
            Start with the cloud app.
            <br />
            <span className="gen-text-heading">
              Scale usage as output grows.
            </span>
          </Heading>

          <Text
            as="p"
            className="text-lg md:text-xl gen-text-muted max-w-xl leading-relaxed"
          >
            The shortest path is managed Genfeed: no deployment, no model
            routing, no quota guessing. Book a demo when a team workflow needs
            design before rollout.
          </Text>

          <HStack className="flex-wrap justify-center gap-3">
            <ButtonTracked
              asChild
              size={ButtonSize.PUBLIC}
              trackingData={{ action: 'signup_bottom_cta' }}
              trackingName="cta_final_click"
            >
              <a href={signUpHref} target="_blank" rel="noopener noreferrer">
                Start Cloud App
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
                Book a Demo
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
      <HomePricing />
      <HomeCTA />
      <HomeFooter />
    </>
  );
}
