'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { EnvironmentService } from '@services/core/environment.service';
import ButtonTracked from '@ui/buttons/tracked/ButtonTracked';
import { HStack } from '@ui/layout/stack';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import { HOME_ASSETS } from '@web-components/home/_assets';
import Image from 'next/image';
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

export default function HomeHero(): React.ReactElement {
  const signUpHref = `${EnvironmentService.apps.app}/sign-up?plan=payg`;

  return (
    <section className="relative overflow-hidden border-b border-edge/5 bg-background">
      <div className="container mx-auto px-6">
        <div className="grid min-h-[calc(100svh-5.5rem)] items-center gap-12 py-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(440px,0.95fr)] lg:gap-14 lg:py-16 xl:gap-20">
          <div className="max-w-[42rem] self-center">
            <Heading
              as="h1"
              className="hero-headline max-w-[42rem] whitespace-normal text-[2.5rem] font-semibold leading-[0.9] tracking-[-0.035em] text-surface sm:whitespace-nowrap sm:text-5xl md:text-[3.5rem] lg:text-[3.5rem] xl:text-[4rem] 2xl:text-[4.5rem]"
            >
              <span className="block">One prompt.</span>
              <span className="block text-surface/60">Publish everywhere.</span>
            </Heading>

            <Text
              as="p"
              className="hero-description mt-6 max-w-xl text-base leading-7 text-surface/62 md:text-lg"
            >
              It becomes the full internet campaign: images, reels, ads,
              articles, captions, newsletters, voice, clips, and the readout
              that tells you what worked.
            </Text>

            <HStack className="mt-8 flex-wrap gap-3">
              <ButtonTracked
                asChild
                size={ButtonSize.PUBLIC}
                className="hero-cta"
                trackingData={{ action: 'signup_payg_hero' }}
                trackingName="hero_cta_click"
              >
                <a href={signUpHref} rel="noopener noreferrer" target="_blank">
                  Create now
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
                  href={EnvironmentService.calendly}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Book a Demo
                </a>
              </ButtonTracked>
            </HStack>
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
                src={HOME_ASSETS.outputWall}
              />
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_54%,rgba(5,6,7,0.82))]" />
            </div>

            <div className="relative z-10 mx-3 -mt-12 overflow-hidden rounded-md bg-edge/10 shadow-border-strong lg:mx-8">
              <p className="border-b border-edge/5 bg-background/95 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-surface/45 backdrop-blur">
                Sample campaign readout
              </p>
              <div className="grid sm:grid-cols-4">
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
            </div>
          </figure>
        </div>
      </div>
    </section>
  );
}
