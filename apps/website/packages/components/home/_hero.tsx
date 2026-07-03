'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { EnvironmentService } from '@services/core/environment.service';
import ButtonTracked from '@ui/buttons/tracked/ButtonTracked';
import { HStack } from '@ui/layout/stack';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import Image from 'next/image';
import Link from 'next/link';
import { LuArrowRight } from 'react-icons/lu';

interface HeroMetric {
  label: string;
  value: string;
}

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

export default function HomeHero(): React.ReactElement {
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
