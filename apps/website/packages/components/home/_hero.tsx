import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { EnvironmentService } from '@services/core/environment.service';
import ButtonTracked from '@ui/buttons/tracked/ButtonTracked';
import HorizontalCarousel from '@ui/layout/horizontal-carousel/HorizontalCarousel';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import {
  HOME_HERO_VIDEO,
  HOME_OUTPUT_CAROUSEL_ASSETS,
} from '@web-components/home/_assets';
import HomeHeroVideo from '@web-components/home/_hero-video';
import HomeOutputCard from '@web-components/home/_output-card';
import Link from 'next/link';

const AGENT_HREF = '/agent';

export default function HomeHero(): React.ReactElement {
  return (
    <section className="relative overflow-hidden border-b border-edge/5 bg-background pb-28 pt-20 sm:pb-36 sm:pt-28 lg:pb-44 lg:pt-36">
      <HomeHeroVideo
        alt={HOME_HERO_VIDEO.alt}
        mp4Src={HOME_HERO_VIDEO.mp4}
        posterSrc={HOME_HERO_VIDEO.poster}
        webmSrc={HOME_HERO_VIDEO.webm}
      />

      <div className="container relative mx-auto px-6 text-center">
        <Text className="animate-gen-stagger-in text-xs font-bold uppercase tracking-[0.16em] text-surface/72">
          Made with Genfeed
        </Text>
        <Heading
          as="h1"
          className="animate-gen-stagger-in mx-auto mt-5 max-w-5xl text-[3rem] font-semibold leading-[0.95] tracking-[-0.055em] text-surface [--gen-stagger-delay:90ms] sm:text-6xl md:text-7xl lg:text-[5.5rem]"
        >
          Everything your brand can become.
        </Heading>
        <Text
          as="p"
          className="animate-gen-stagger-in mx-auto mt-7 max-w-xl text-base leading-7 text-surface/72 [--gen-stagger-delay:180ms] md:text-lg"
        >
          Every format. One recognisable brand.
        </Text>

        <div
          className="animate-gen-stagger-in mt-9 [--gen-stagger-delay:270ms]"
          data-testid="home-hero-actions"
        >
          <div className="flex flex-wrap items-center justify-center gap-3">
            <ButtonTracked
              asChild
              size={ButtonSize.PUBLIC}
              className="hero-cta"
              trackingData={{ action: 'start_creating_hero' }}
              trackingName="home_hero_click"
            >
              <a href={`${EnvironmentService.apps.app}/sign-up`}>
                Start creating
              </a>
            </ButtonTracked>

            <ButtonTracked
              asChild
              className="hero-cta"
              size={ButtonSize.PUBLIC}
              trackingData={{ action: 'use_agent_hero' }}
              trackingName="home_hero_click"
              variant={ButtonVariant.SECONDARY}
            >
              <Link href={AGENT_HREF}>Use the Agent</Link>
            </ButtonTracked>
          </div>
          <Text as="p" className="mt-5 text-center text-[13px] text-surface/72">
            Free to start. No card required.
          </Text>
        </div>
      </div>

      {/*
        The rail breaks the container on purpose: cards run to both edges so the
        row reads as a strip of output that continues past the viewport rather
        than a boxed gallery of six. The inset matches the container's gutter at
        the point the container stops growing, so the first card lines up with
        the headline above it.
      */}
      <div
        className="animate-gen-rise relative mt-24 w-screen [--gen-stagger-delay:360ms] sm:mt-32 lg:mt-36"
        data-testid="home-hero-output-carousel"
      >
        <HorizontalCarousel
          gap="md"
          itemClassName="snap-x snap-mandatory scroll-px-6 px-6 pb-4 lg:scroll-px-[max(3rem,calc((100vw-90rem)/2))] lg:px-[max(3rem,calc((100vw-90rem)/2))]"
        >
          {HOME_OUTPUT_CAROUSEL_ASSETS.map((asset, index) => (
            <HomeOutputCard
              asset={asset}
              isPreloaded={index === 0}
              key={asset.format}
            />
          ))}
        </HorizontalCarousel>
      </div>
    </section>
  );
}
