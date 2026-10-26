'use client';

import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { AuthShowcaseProps } from '@genfeedai/props/layout/auth-showcase.props';
import Image from 'next/image';
import { useEffect, useState } from 'react';

/**
 * Real Genfeed art that ships with the app: frames cropped from the cinematic
 * storyboard stills and the studio tool previews. Decorative only, so every
 * image has an empty alt and the showcase is hidden from assistive technology
 * by its parent.
 */
const STILL_PATH = '/auth-showcase';

const STILLS = [
  `${STILL_PATH}/cinema-camera.webp`,
  `${STILL_PATH}/shelf-transition.webp`,
  `${STILL_PATH}/event-stage.webp`,
  `${STILL_PATH}/studio-desk.webp`,
  `${STILL_PATH}/product-knot.webp`,
  `${STILL_PATH}/cinema-light.webp`,
  `${STILL_PATH}/event-crowd.webp`,
  `${STILL_PATH}/studio-sketch.webp`,
  `${STILL_PATH}/shelf-after.webp`,
  `${STILL_PATH}/cinema-clapper.webp`,
  `${STILL_PATH}/event-confetti.webp`,
  `${STILL_PATH}/shelf-before.webp`,
] as const;

const APP_WINDOWS = [
  `${STILL_PATH}/app-playground.webp`,
  `${STILL_PATH}/app-storyboard.webp`,
  `${STILL_PATH}/app-motion.webp`,
  `${STILL_PATH}/app-discovery.webp`,
  `${STILL_PATH}/app-automation.webp`,
] as const;

const ROTATE_INTERVAL_MS = 4500;

const WALL_COLUMNS: ReadonlyArray<{
  id: string;
  isReversed: boolean;
  items: readonly string[];
}> = [
  { id: 'a', isReversed: false, items: STILLS.slice(0, 4) },
  { id: 'b', isReversed: true, items: STILLS.slice(4, 8) },
  { id: 'c', isReversed: false, items: STILLS.slice(8, 12) },
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
                      itemIndex % 2 === 0 ? 'aspect-[3/4]' : 'aspect-[4/3]',
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
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background from-25% via-background/80 via-45% to-transparent" />
      <div className="absolute inset-x-0 bottom-0 p-10">
        <ShowcaseCopy {...props} />
      </div>
    </ShowcaseFrame>
  );
}

function ToolRotator(props: Omit<AuthShowcaseProps, 'variant'>) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % APP_WINDOWS.length);
    }, ROTATE_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <ShowcaseFrame className="flex flex-col justify-between p-10">
      <div className="pointer-events-none absolute -bottom-32 left-1/2 size-[32rem] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />
      <ShowcaseCopy {...props} />
      <div className="relative space-y-6">
        <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl border border-border bg-background shadow-2xl">
          {APP_WINDOWS.map((src, index) => (
            <Image
              key={src}
              src={src}
              alt=""
              fill
              priority={index === 0}
              sizes="(min-width: 1024px) 50vw, 0px"
              className={cn(
                'object-cover transition-opacity duration-1000 motion-reduce:transition-none',
                index === activeIndex ? 'opacity-100' : 'opacity-0',
              )}
            />
          ))}
        </div>
        <div className="flex justify-center gap-1.5">
          {APP_WINDOWS.map((src, index) => (
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

function ContentBento(props: Omit<AuthShowcaseProps, 'variant'>) {
  const bentoCells = [
    { className: 'col-span-2 row-span-2', src: STILLS[1] },
    { className: '', src: STILLS[0] },
    { className: '', src: STILLS[3] },
    { className: 'col-span-2', src: APP_WINDOWS[0] },
    { className: '', src: STILLS[4] },
    { className: '', src: STILLS[2] },
  ];

  return (
    <ShowcaseFrame className="flex flex-col justify-between gap-8 p-10">
      <ShowcaseCopy {...props} />
      <div className="grid min-h-0 flex-1 grid-cols-4 grid-rows-4 gap-3">
        {bentoCells.map((cell) => (
          <div
            key={cell.src}
            className={cn(
              'relative overflow-hidden rounded-xl border border-border',
              cell.className,
            )}
          >
            <Image
              src={cell.src}
              alt=""
              fill
              sizes="(min-width: 1024px) 30vw, 0px"
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
    case 'rotator':
      return <ToolRotator {...copy} />;
    case 'bento':
      return <ContentBento {...copy} />;
  }
}
