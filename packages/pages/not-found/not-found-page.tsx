'use client';

import { cn } from '@helpers/formatting/cn/cn.util';
import { useThemeLogo } from '@hooks/ui/use-theme-logo/use-theme-logo';
import type { NotFoundProps } from '@props/layout/not-found.props';
import Image from 'next/image';
import Link from 'next/link';

const DIGIT_CLASS =
  'select-none text-[5.5rem] font-extrabold leading-[0.8] tracking-tighter tabular-nums sm:text-[8rem] md:text-[10rem]';

export default function NotFoundPage({
  homeHref = '/',
  homeLabel = 'Go back home',
  variant = 'embedded',
}: NotFoundProps) {
  const logoUrl = useThemeLogo();

  return (
    // `page` is a standalone route (the root 404 has no app shell around it),
    // so it owns the whole viewport. `embedded` fills only its layout region:
    // `min-h-dvh` nested under the app shell (sidebar + topbar) stacked a full
    // viewport on top of chrome and forced a useless scrollbar.
    <div
      className={cn(
        'flex w-full items-center justify-center bg-background text-center',
        variant === 'page'
          ? 'min-h-dvh'
          : 'h-full min-h-0 flex-1 overflow-hidden',
      )}
    >
      <div className="flex flex-col items-center gap-5 px-4 py-10">
        <div
          role="img"
          aria-label="404"
          className="flex items-center justify-center gap-1 text-foreground sm:gap-3"
        >
          <span aria-hidden="true" className={DIGIT_CLASS}>
            4
          </span>

          <div
            aria-hidden="true"
            className="relative size-20 sm:size-[7.5rem] md:size-[9.5rem]"
          >
            <svg
              className="absolute inset-0 size-full text-foreground"
              fill="none"
              viewBox="0 0 200 200"
            >
              <g className="origin-center motion-safe:animate-[spin_14s_linear_infinite]">
                <circle
                  cx="100"
                  cy="100"
                  r="96"
                  stroke="currentColor"
                  strokeDasharray="2 7"
                  strokeLinecap="round"
                  strokeOpacity="0.3"
                  strokeWidth="1.5"
                />
              </g>
              <g className="origin-center motion-safe:animate-[spin_22s_linear_infinite_reverse]">
                <circle
                  cx="100"
                  cy="100"
                  r="82"
                  stroke="currentColor"
                  strokeOpacity="0.15"
                  strokeWidth="1.5"
                />
                <circle cx="100" cy="18" r="3.2" fill="currentColor" />
              </g>
            </svg>

            {logoUrl && (
              <Image
                src={logoUrl}
                className="absolute inset-[25%] size-1/2 object-contain dark:invert"
                alt=""
                width={96}
                height={96}
                priority
              />
            )}
          </div>

          <span aria-hidden="true" className={DIGIT_CLASS}>
            4
          </span>
        </div>

        <h1 className="text-3xl font-extrabold tracking-tight text-balance md:text-4xl">
          This page wandered off
        </h1>
        <p className="max-w-[44ch] text-pretty text-foreground/70">
          The link may be old, or the page has moved.
        </p>

        <Link
          href={homeHref}
          className="mt-1 inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground shadow transition-colors duration-200 hover:bg-primary/90"
        >
          {homeLabel}
        </Link>
      </div>
    </div>
  );
}
