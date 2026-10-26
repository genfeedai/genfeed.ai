'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cdnAsset } from '@genfeedai/helpers/media/cdn/cdn.helper';
import type { AuthShowcaseProps } from '@genfeedai/props/layout/auth-showcase.props';
import { Button } from '@ui/primitives/button';
import { Pause, Play } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

/**
 * The homepage hero loop: generated creator footage, served from the Genfeed
 * CDN like every other marketing clip (see apps/website home assets).
 */
const HERO_LOOP = {
  mp4: cdnAsset('/assets/site/home/hero/hero-loop.mp4'),
  poster: cdnAsset('/assets/site/home/hero/hero-loop-poster.webp'),
  webm: cdnAsset('/assets/site/home/hero/hero-loop.webm'),
} as const;

const DESKTOP_QUERY = '(min-width: 1024px)';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Text-free background video for the auth screens.
 *
 * The clip is muted, looping and has a pause control. It only loads on desktop
 * widths, where the form layout shows it, and never for people who prefer
 * reduced motion: they get the poster frame.
 */
export default function AuthShowcase({
  pauseLabel,
  playLabel,
}: AuthShowcaseProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isVideoEnabled, setIsVideoEnabled] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);

  useEffect(() => {
    const desktop = window.matchMedia(DESKTOP_QUERY);
    const reducedMotion = window.matchMedia(REDUCED_MOTION_QUERY);

    function sync() {
      setIsVideoEnabled(desktop.matches && !reducedMotion.matches);
      setIsPlaying(true);
    }

    sync();
    desktop.addEventListener('change', sync);
    reducedMotion.addEventListener('change', sync);

    return () => {
      desktop.removeEventListener('change', sync);
      reducedMotion.removeEventListener('change', sync);
    };
  }, []);

  function handleToggle() {
    const element = videoRef.current;
    if (!element) {
      return;
    }

    if (element.paused) {
      void element.play();
      setIsPlaying(true);
    } else {
      element.pause();
      setIsPlaying(false);
    }
  }

  return (
    <div className="relative h-full min-h-[calc(100vh-1.5rem)] overflow-hidden rounded-2xl border border-border bg-black">
      <Image
        src={HERO_LOOP.poster}
        alt=""
        fill
        priority
        unoptimized
        sizes="(min-width: 1024px) 55vw, 0px"
        className="object-cover"
      />
      {isVideoEnabled ? (
        <>
          <video
            ref={videoRef}
            autoPlay
            className="absolute inset-0 size-full object-cover"
            loop
            muted
            playsInline
            poster={HERO_LOOP.poster}
            preload="metadata"
          >
            <source src={HERO_LOOP.webm} type="video/webm" />
            <source src={HERO_LOOP.mp4} type="video/mp4" />
            <track kind="captions" />
          </video>
          <Button
            ariaLabel={isPlaying ? pauseLabel : playLabel}
            className="absolute right-4 top-4"
            icon={
              isPlaying ? (
                <Pause className="size-4" />
              ) : (
                <Play className="size-4" />
              )
            }
            onClick={handleToggle}
            size={ButtonSize.ICON}
            type="button"
            variant={ButtonVariant.SECONDARY}
            withWrapper={false}
          />
        </>
      ) : null}
    </div>
  );
}
