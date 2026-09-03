import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { EnvironmentService } from '@services/core/environment.service';
import ButtonTracked from '@ui/buttons/tracked/ButtonTracked';
import HorizontalCarousel from '@ui/layout/horizontal-carousel/HorizontalCarousel';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import { HOME_OUTPUT_CAROUSEL_ASSETS } from '@web-components/home/_assets';
import Image from 'next/image';
import Link from 'next/link';

const AGENT_HREF = '/agent';

export default function HomeHero(): React.ReactElement {
  return (
    <section className="overflow-hidden border-b border-edge/5 bg-background pb-24 pt-20 sm:pb-32 sm:pt-28 lg:pb-40 lg:pt-36">
      <div className="container mx-auto px-6 text-center">
        <Text className="animate-gen-stagger-in text-xs font-bold uppercase tracking-[0.16em] text-surface/72">
          Made with Genfeed
        </Text>
        <Heading
          as="h1"
          className="animate-gen-stagger-in mx-auto mt-5 max-w-5xl text-[3rem] font-semibold leading-[0.95] tracking-[-0.055em] text-surface [animation-delay:90ms] sm:text-6xl md:text-7xl lg:text-[5.5rem]"
        >
          Everything your brand can become.
        </Heading>
        <Text
          as="p"
          className="animate-gen-stagger-in mx-auto mt-7 max-w-xl text-base leading-7 text-surface/72 [animation-delay:180ms] md:text-lg"
        >
          Every format. One recognisable brand.
        </Text>

        <div
          className="animate-gen-stagger-in mt-9 [animation-delay:270ms]"
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

      <div
        className="animate-gen-rise mt-20 w-screen px-6 [animation-delay:360ms] sm:mt-28 lg:px-[max(3rem,calc((100vw-90rem)/2))]"
        data-testid="home-hero-output-carousel"
      >
        <HorizontalCarousel
          className="mx-auto"
          gap="sm"
          itemClassName="snap-x snap-mandatory pb-3"
        >
          {HOME_OUTPUT_CAROUSEL_ASSETS.map((item, index) => {
            const isFeatured = index === 0;

            return (
              <figure
                key={item.alt}
                className={`group relative flex-none snap-center overflow-hidden rounded-xl bg-card shadow-border-strong ${
                  isFeatured
                    ? 'h-[32rem] w-[78vw] max-w-[31rem] sm:h-[38rem]'
                    : 'h-[28rem] w-[68vw] max-w-[22rem] sm:h-[34rem]'
                }`}
                data-testid="home-hero-output-carousel-item"
              >
                <Image
                  alt={item.alt}
                  className="object-cover transition-transform duration-700 group-hover:scale-[1.025] motion-reduce:transition-none"
                  fill
                  priority={isFeatured}
                  sizes={
                    isFeatured
                      ? '(max-width: 640px) 78vw, 496px'
                      : '(max-width: 640px) 68vw, 352px'
                  }
                  src={item.src}
                />
                <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_45%,rgba(5,6,7,0.94))]" />
                <figcaption className="absolute inset-x-0 bottom-0 z-10 p-6 text-left sm:p-7">
                  <Text className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/65">
                    {item.format}
                  </Text>
                  <Heading
                    as="h2"
                    className="mt-2 text-2xl font-semibold tracking-[-0.035em] text-white sm:text-3xl"
                  >
                    {item.title}
                  </Heading>
                </figcaption>
              </figure>
            );
          })}
        </HorizontalCarousel>
      </div>
    </section>
  );
}
