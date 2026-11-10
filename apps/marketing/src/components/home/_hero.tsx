import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import AgentFirstActions from '@web-components/buttons/agent-first-actions/AgentFirstActions';
import {
  HOME_HERO_VIDEO,
  HOME_OUTPUT_CAROUSEL_ASSETS,
} from '@web-components/home/_assets';
import HomeHeroVideo from '@web-components/home/_hero-video';
import HomeOutputCard from '@web-components/home/_output-card';
import MarqueeRail from '@web-components/layout/marquee-rail/MarqueeRail';

export default function HomeHero(): React.ReactElement {
  return (
    /*
      The shell clears the fixed top bar with `pt-20` on <main>, which leaves
      the strip behind the bar as bare page background — so a transparent bar
      has nothing to be transparent over. Pulling the section back up by exactly
      that clearance, and paying it back as padding, runs the footage under the
      bar without moving a single word on the page.
    */
    <section className="relative -mt-20 overflow-hidden border-b border-foreground/5 bg-background pb-28 pt-40 sm:pb-36 sm:pt-48 lg:pb-44 lg:pt-56">
      <HomeHeroVideo
        alt={HOME_HERO_VIDEO.alt}
        mp4Src={HOME_HERO_VIDEO.mp4}
        posterSrc={HOME_HERO_VIDEO.poster}
        webmSrc={HOME_HERO_VIDEO.webm}
      />

      <div className="container relative mx-auto px-6 text-center">
        <Text
          as="p"
          className="animate-gen-stagger-in mb-6 text-xs font-bold uppercase tracking-[0.16em] text-foreground/80"
          data-testid="home-hero-eyebrow"
        >
          The content studio for everything you publish
        </Text>
        <Heading
          as="h1"
          className="animate-gen-stagger-rise mx-auto max-w-5xl text-[clamp(2.25rem,10.5vw,3rem)] font-semibold leading-[0.95] tracking-[-0.02em] text-foreground [--gen-stagger-delay:90ms] sm:text-6xl md:text-7xl lg:text-[5.5rem]"
        >
          From brief to feed.
        </Heading>
        <Text
          as="p"
          className="animate-gen-stagger-in mx-auto mt-7 max-w-2xl text-base leading-7 text-foreground/80 [--gen-stagger-delay:180ms] md:text-lg"
        >
          Video, images, posts, articles, newsletters and voice. Briefed from
          your own agent, made on your brand, then published and tracked in one
          dashboard.
        </Text>

        <div
          className="animate-gen-stagger-in mt-9 [--gen-stagger-delay:270ms]"
          data-hero-cta
          data-testid="home-hero-actions"
        >
          <div className="flex flex-wrap items-center justify-center gap-3">
            <AgentFirstActions trackingName="home_hero_click" />
          </div>
          <Text as="p" className="mt-5 text-center text-sm text-foreground/80">
            Connecting takes one sign-in.
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
