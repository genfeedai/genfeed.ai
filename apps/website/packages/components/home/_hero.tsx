'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import { EnvironmentService } from '@services/core/environment.service';
import ButtonTracked from '@ui/buttons/tracked/ButtonTracked';
import { HStack } from '@ui/layout/stack';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import { HOME_OUTPUT_WALL_ASSETS } from '@web-components/home/_assets';
import Image from 'next/image';
import { LuArrowRight } from 'react-icons/lu';

interface HeroMetric {
  label: string;
  value: string;
}

const HERO_METRICS: HeroMetric[] = [
  { label: 'approved for launch', value: '42 assets' },
  { label: 'published from one brief', value: '9 channels' },
  { label: 'held for human review', value: '3 drafts' },
  { label: 'measured in analytics', value: '31% hook rate' },
];

const HERO_WALL_ITEMS = [
  {
    ...HOME_OUTPUT_WALL_ASSETS[0],
    className:
      'col-span-6 row-span-3 sm:col-span-5 sm:row-span-5 sm:col-start-1 sm:row-start-1',
    imageClassName: 'object-[50%_50%]',
    priority: true,
    sizes: '(max-width: 640px) 100vw, (max-width: 1024px) 45vw, 360px',
  },
  {
    ...HOME_OUTPUT_WALL_ASSETS[1],
    className:
      'col-span-3 row-span-4 sm:col-span-3 sm:row-span-9 sm:col-start-6 sm:row-start-1',
    imageClassName: 'object-[50%_50%]',
    priority: true,
    sizes: '(max-width: 640px) 50vw, (max-width: 1024px) 28vw, 220px',
  },
  {
    ...HOME_OUTPUT_WALL_ASSETS[2],
    className:
      'col-span-3 row-span-4 sm:col-span-4 sm:row-span-4 sm:col-start-9 sm:row-start-1',
    imageClassName: 'object-[50%_50%]',
    priority: true,
    sizes: '(max-width: 640px) 50vw, (max-width: 1024px) 35vw, 300px',
  },
  {
    ...HOME_OUTPUT_WALL_ASSETS[3],
    className:
      'col-span-4 row-span-3 sm:col-span-5 sm:row-span-4 sm:col-start-1 sm:row-start-6',
    imageClassName: 'object-[48%_42%]',
    priority: false,
    sizes: '(max-width: 640px) 66vw, (max-width: 1024px) 42vw, 360px',
  },
  {
    ...HOME_OUTPUT_WALL_ASSETS[4],
    className:
      'col-span-2 row-span-3 sm:col-span-4 sm:row-span-5 sm:col-start-9 sm:row-start-5',
    imageClassName: 'object-[50%_50%]',
    priority: false,
    sizes: '(max-width: 640px) 34vw, (max-width: 1024px) 35vw, 300px',
  },
  {
    ...HOME_OUTPUT_WALL_ASSETS[5],
    className:
      'col-span-6 row-span-2 sm:col-span-12 sm:row-span-3 sm:col-start-1 sm:row-start-10',
    imageClassName: 'object-[50%_50%]',
    priority: false,
    sizes: '(max-width: 640px) 100vw, (max-width: 1024px) 80vw, 860px',
  },
] as const;

export default function HomeHero(): React.ReactElement {
  return (
    <section className="relative overflow-hidden border-b border-edge/5 bg-background">
      <div className="container mx-auto px-6">
        <div className="grid min-h-[calc(100svh-5.5rem)] items-center gap-12 py-14 lg:grid-cols-[minmax(0,1.05fr)_minmax(440px,0.95fr)] lg:gap-14 lg:py-16 xl:gap-20">
          <div className="max-w-[42rem] self-center">
            <Text className="mb-5 text-xs font-bold uppercase tracking-[0.16em] text-surface/65">
              Distribution infrastructure for AI agents
            </Text>
            <Heading
              as="h1"
              className="hero-headline max-w-[44rem] text-[2.5rem] font-semibold leading-[1.02] tracking-[-0.035em] text-surface sm:text-5xl md:text-[3.5rem] lg:text-[3.5rem] xl:text-[4rem] 2xl:text-[4.5rem]"
            >
              Your product deserves to be discovered.
            </Heading>

            <Text
              as="p"
              className="mt-6 text-xl font-semibold tracking-[-0.02em] text-surface md:text-2xl"
            >
              One prompt. Publish everywhere.
            </Text>

            <Text
              as="p"
              className="hero-description mt-4 max-w-2xl text-base leading-7 text-surface/62 md:text-lg"
            >
              Connect Claude Code, Codex, or any MCP client. Genfeed turns your
              product brief into platform-native content, distributes it across
              every channel, and brings approvals, scheduling, and performance
              back into one control plane.
            </Text>

            <HStack className="mt-8 flex-wrap gap-3">
              <ButtonTracked
                asChild
                size={ButtonSize.PUBLIC}
                className="hero-cta"
                trackingData={{ action: 'connect_mcp_hero' }}
                trackingName="hero_cta_click"
              >
                <a
                  href={EnvironmentService.mcpConnectHref}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Connect MCP
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
              <div
                className="grid aspect-[4/5] grid-cols-6 grid-rows-[repeat(12,minmax(0,1fr))] gap-2 p-2 sm:aspect-[860/620] sm:grid-cols-12 sm:p-3"
                data-testid="home-hero-content-wall-grid"
              >
                {HERO_WALL_ITEMS.map((item) => (
                  <div
                    key={item.alt}
                    className={`group relative min-h-0 overflow-hidden rounded-md bg-background ${item.className}`}
                    data-testid="home-hero-output-wall-item"
                  >
                    <Image
                      alt={item.alt}
                      className={`object-cover transition-transform duration-700 group-hover:scale-[1.03] ${item.imageClassName}`}
                      fill
                      priority={item.priority}
                      sizes={item.sizes}
                      src={item.src}
                    />
                  </div>
                ))}
              </div>
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_54%,rgba(5,6,7,0.82))]" />
            </div>

            <div className="relative z-10 mx-3 -mt-12 overflow-hidden rounded-md bg-edge/10 shadow-border-strong lg:mx-8">
              <p className="border-b border-edge/5 bg-background/95 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-surface/45 backdrop-blur">
                Sample distribution readout
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
