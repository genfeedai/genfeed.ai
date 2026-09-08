'use client';

import type { HomeOutputCardProps } from '@props/website/home.props';
import { Heading } from '@ui/typography/heading';
import { Text } from '@ui/typography/text';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const VIDEO_MIN_WIDTH_QUERY = '(min-width: 768px)';

/**
 * How much of a card has to be on screen before its clip is worth fetching.
 * Half, rather than a sliver: a card caught at the edge of a horizontal scroll
 * is not being looked at, and six clips downloading at once is the failure mode
 * this threshold exists to prevent.
 */
const VISIBLE_RATIO = 0.5;

/**
 * One card in the homepage output rail: a generated clip that starts when the
 * card scrolls into view and stops when it leaves.
 *
 * Six autoplaying videos in a horizontal rail would be several megabytes for
 * footage most visitors never scroll to, so nothing is fetched up front. The
 * poster — frame 0 of this card's own encoded MP4 — carries the card until its
 * clip is both wanted and ready, which makes the swap invisible: the first
 * painted video frame is the still it replaces.
 */
export default function HomeOutputCard({
  asset,
  isPreloaded,
}: HomeOutputCardProps): React.ReactElement {
  const [isClipWanted, setIsClipWanted] = useState(false);
  const [hasPainted, setHasPainted] = useState(false);
  const figureRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hasClip = Boolean(asset.mp4 && asset.webm);

  useEffect(() => {
    const figure = figureRef.current;
    if (!figure || !hasClip) return;

    // `saveData` is Chromium-only and absent elsewhere; an absent flag means
    // "no stated preference", which is not the same as "wants the video".
    const isSavingData =
      (navigator as Navigator & { connection?: { saveData?: boolean } })
        .connection?.saveData === true;

    if (
      window.matchMedia(REDUCED_MOTION_QUERY).matches ||
      !window.matchMedia(VIDEO_MIN_WIDTH_QUERY).matches ||
      isSavingData
    ) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;

        if (entry.isIntersecting) {
          // First pass there is no element yet — this render is what creates
          // it, and `autoPlay` starts it. On a later pass the element exists
          // and was paused on the way out, so it needs an explicit nudge.
          setIsClipWanted(true);
          videoRef.current?.play().catch(() => {
            // Autoplay can still be refused (a background tab, a battery-saver
            // policy). The poster is already correct, so there is nothing to do.
          });
          return;
        }

        videoRef.current?.pause();
      },
      { threshold: VISIBLE_RATIO },
    );

    observer.observe(figure);

    return () => observer.disconnect();
  }, [hasClip]);

  return (
    <figure
      className="group relative aspect-[9/16] h-[26rem] flex-none overflow-hidden rounded-3xl bg-card shadow-border-strong sm:h-[32rem] lg:h-[36rem]"
      data-testid="home-hero-output-carousel-item"
      ref={figureRef}
    >
      <Image
        alt={asset.alt}
        className="object-cover"
        fill
        priority={isPreloaded}
        sizes="(max-width: 640px) 60vw, 405px"
        src={asset.poster}
      />

      {isClipWanted && hasClip ? (
        <video
          autoPlay
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${
            hasPainted ? 'opacity-100' : 'opacity-0'
          }`}
          data-testid="home-hero-output-carousel-video"
          loop
          muted
          onPlaying={() => setHasPainted(true)}
          playsInline
          poster={asset.poster}
          preload="auto"
          ref={videoRef}
        >
          <source src={asset.webm} type="video/webm" />
          <source src={asset.mp4} type="video/mp4" />
          <track kind="captions" />
        </video>
      ) : null}

      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_42%,rgba(5,6,7,0.92))]" />

      <figcaption className="absolute inset-x-0 bottom-0 z-10 p-6 text-left sm:p-7">
        <Text className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/65">
          {asset.format}
        </Text>
        <Heading
          as="h2"
          className="mt-2 text-2xl font-semibold tracking-[-0.035em] text-white sm:text-3xl"
        >
          {asset.title}
        </Heading>
      </figcaption>
    </figure>
  );
}
