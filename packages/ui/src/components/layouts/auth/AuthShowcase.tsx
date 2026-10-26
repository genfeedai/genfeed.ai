'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { AuthShowcaseProps } from '@genfeedai/props/layout/auth-showcase.props';
import Image from 'next/image';
import { useEffect, useState } from 'react';

/**
 * Real Genfeed art that already ships with the app: cinematic storyboard
 * stills and the plugin previews. Decorative only, so every image has an empty
 * alt and the showcase is hidden from assistive technology by its parent.
 */
const STILLS = [
  '/storyboard-presets/productLaunch.webp',
  '/storyboard-presets/founderStory.webp',
  '/storyboard-presets/beforeAfter.webp',
  '/storyboard-presets/behindTheScenes.webp',
  '/storyboard-presets/customerStory.webp',
  '/storyboard-presets/seasonRecap.webp',
  '/storyboard-presets/howTo.webp',
  '/storyboard-presets/threeStepExplainer.webp',
] as const;

const PLUGIN_ART = [
  '/plugins/playground.webp',
  '/plugins/storyboard.webp',
  '/plugins/editor.webp',
] as const;

const HERO_SLIDES = [
  '/plugins/playground.webp',
  '/storyboard-presets/productLaunch.webp',
  '/plugins/storyboard.webp',
  '/storyboard-presets/founderStory.webp',
  '/plugins/editor.webp',
  '/storyboard-presets/beforeAfter.webp',
] as const;

const HERO_INTERVAL_MS = 4500;

const WALL_COLUMNS: ReadonlyArray<{
  id: string;
  isReversed: boolean;
  items: readonly string[];
}> = [
  {
    id: 'a',
    isReversed: false,
    items: [STILLS[0], STILLS[3], STILLS[6], STILLS[1]],
  },
  {
    id: 'b',
    isReversed: true,
    items: [STILLS[2], STILLS[5], STILLS[7], STILLS[4]],
  },
  {
    id: 'c',
    isReversed: false,
    items: [STILLS[4], STILLS[1], STILLS[3], STILLS[6]],
  },
];

function ShowcaseCopy({
  description,
  headline,
  steps,
}: Pick<AuthShowcaseProps, 'description' | 'headline' | 'steps'>) {
  return (
    <div className="space-y-4">
      <h2 className="max-w-md text-balance text-3xl font-semibold tracking-tight text-foreground">
        {headline}
      </h2>
      <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      <ol className="flex flex-wrap items-center gap-2 text-xs font-medium text-foreground">
        {steps.map((step, index) => (
          <li
            key={step}
            className="flex items-center gap-2 rounded-full border border-border bg-background/70 px-3 py-1 backdrop-blur"
          >
            <span className="text-muted-foreground">{index + 1}</span>
            {step}
          </li>
        ))}
      </ol>
    </div>
  );
}

function ShowcaseFrame({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'relative h-full min-h-[calc(100vh-1.5rem)] overflow-hidden rounded-2xl border border-border bg-card',
        className,
      )}
    >
      {children}
    </div>
  );
}

function MediaWall(props: Omit<AuthShowcaseProps, 'variant'>) {
  return (
    <ShowcaseFrame>
      <div className="absolute inset-0 grid grid-cols-3 gap-3 px-3">
        {WALL_COLUMNS.map((column, columnIndex) => (
          <div key={column.id} className="overflow-hidden">
            <div
              className={cn(
                'animate-auth-wall-scroll flex flex-col gap-3',
                column.isReversed && '[animation-direction:reverse]',
              )}
              style={
                {
                  '--auth-wall-duration': `${70 + columnIndex * 15}s`,
                } as React.CSSProperties
              }
            >
              {[0, 1].flatMap((copy) =>
                column.items.map((src, itemIndex) => (
                  <div
                    key={`${copy}-${src}`}
                    className={cn(
                      'relative w-full shrink-0 overflow-hidden rounded-xl border border-border',
                      itemIndex % 2 === 0 ? 'aspect-[4/5]' : 'aspect-square',
                    )}
                  >
                    <Image
                      src={src}
                      alt=""
                      fill
                      sizes="(min-width: 1024px) 20vw, 0px"
                      className="object-cover"
                    />
                  </div>
                )),
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background via-background/60 via-35% to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-10">
        <ShowcaseCopy {...props} />
      </div>
    </ShowcaseFrame>
  );
}

function HeroRotator(props: Omit<AuthShowcaseProps, 'variant'>) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % HERO_SLIDES.length);
    }, HERO_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <ShowcaseFrame>
      {HERO_SLIDES.map((src, index) => (
        <Image
          key={src}
          src={src}
          alt=""
          fill
          priority={index === 0}
          sizes="(min-width: 1024px) 55vw, 0px"
          className={cn(
            'object-cover transition-opacity duration-1000 motion-reduce:transition-none',
            index === activeIndex ? 'opacity-100' : 'opacity-0',
          )}
        />
      ))}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background via-background/70 via-30% to-transparent" />
      <div className="absolute inset-x-0 bottom-0 space-y-6 p-10">
        <ShowcaseCopy {...props} />
        <div className="flex gap-1.5">
          {HERO_SLIDES.map((src, index) => (
            <span
              key={src}
              className={cn(
                'h-1 rounded-full transition-all duration-500',
                index === activeIndex
                  ? 'w-8 bg-foreground'
                  : 'w-2 bg-foreground/30',
              )}
            />
          ))}
        </div>
      </div>
    </ShowcaseFrame>
  );
}

function ProductStack(props: Omit<AuthShowcaseProps, 'variant'>) {
  return (
    <ShowcaseFrame className="flex flex-col justify-between p-10">
      <div className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-primary/15 blur-3xl" />
      <ShowcaseCopy {...props} />
      <div className="relative mx-auto my-10 aspect-[16/10] w-full max-w-xl">
        {PLUGIN_ART.map((src, index) => (
          <div
            key={src}
            className="absolute overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
            style={{
              height: '78%',
              left: `${index * 9}%`,
              top: `${(PLUGIN_ART.length - 1 - index) * 9}%`,
              width: '78%',
              zIndex: index,
            }}
          >
            <Image
              src={src}
              alt=""
              fill
              sizes="(min-width: 1024px) 40vw, 0px"
              className="object-cover"
            />
          </div>
        ))}
      </div>
    </ShowcaseFrame>
  );
}

export default function AuthShowcase({ variant, ...copy }: AuthShowcaseProps) {
  switch (variant) {
    case 'wall':
      return <MediaWall {...copy} />;
    case 'hero':
      return <HeroRotator {...copy} />;
    case 'stack':
      return <ProductStack {...copy} />;
  }
}
