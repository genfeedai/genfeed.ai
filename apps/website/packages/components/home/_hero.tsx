import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { EnvironmentService } from '@services/core/environment.service';
import ButtonTracked from '@ui/buttons/tracked/ButtonTracked';
import MarqueeRail from '@ui/layout/marquee-rail/MarqueeRail';
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
    /*
      The shell clears the fixed top bar with `pt-20` on <main>, which leaves
      the strip behind the bar as bare page background — so a transparent bar
      has nothing to be transparent over. Pulling the section back up by exactly
      that clearance, and paying it back as padding, runs the footage under the
      bar without moving a single word on the page.
    */
    <section className="relative -mt-20 overflow-hidden border-b border-edge/5 bg-background pb-28 pt-40 sm:pb-36 sm:pt-48 lg:pb-44 lg:pt-56">
      <HomeHeroVideo
        alt={HOME_HERO_VIDEO.alt}
        mp4Src={HOME_HERO_VIDEO.mp4}
        posterSrc={HOME_HERO_VIDEO.poster}
        webmSrc={HOME_HERO_VIDEO.webm}
      />

      <div className="container relative mx-auto px-6 text-center">
        <Heading
          as="h1"
          className="animate-gen-stagger-in mx-auto max-w-5xl text-[3rem] font-semibold leading-[0.95] tracking-[-0.055em] text-surface [--gen-stagger-delay:90ms] sm:text-6xl md:text-7xl lg:text-[5.5rem]"
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
        The rail moves on its own and never stops, so it reads as output in
        flight rather than a control to operate. It breaks the container to both
        edges: the row continues past the viewport, which is the point.
      */}
      <div
        className="animate-gen-rise relative mt-24 w-screen [--gen-stagger-delay:360ms] sm:mt-32 lg:mt-36"
        data-testid="home-hero-output-carousel"
      >
        <MarqueeRail>
          {HOME_OUTPUT_CAROUSEL_ASSETS.map((asset, index) => (
            <HomeOutputCard
              asset={asset}
              isPreloaded={index === 0}
              key={asset.format}
            />
          ))}
        </MarqueeRail>
      </div>
    </section>
  );
}
