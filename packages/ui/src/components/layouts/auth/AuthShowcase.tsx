'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { AuthShowcaseProps } from '@genfeedai/props/layout/auth-showcase.props';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import { Button } from '@ui/primitives/button';
import { Pause, Play } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

const BACKGROUND_VIDEO_CONFIG = {
  autoPlay: true,
  controls: false,
  loop: false,
  muted: true,
  playsInline: true,
  preload: 'auto',
} as const;

const DESKTOP_QUERY = '(min-width: 1024px)';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Rotating examples of what Genfeed generates, for the auth screens.
 *
 * Each clip is muted and plays once, then the next one starts; every example
 * shows the model that made it, a one-line caption and a progress bar that is
 * also the control for jumping to it. The video only loads on desktop widths,
 * where the form layout shows this panel, and never for people who prefer
 * reduced motion: they get one still per example and pick it themselves.
 */
export default function AuthShowcase({
  pauseLabel,
  playLabel,
  regionLabel,
  slides,
}: AuthShowcaseProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isDesktop, setIsDesktop] = useState(false);
  const [isReducedMotion, setIsReducedMotion] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [progress, setProgress] = useState(0);

  const isVideoEnabled = isDesktop && !isReducedMotion;
  const activeSlide = slides[activeIndex];

  useEffect(() => {
    const desktop = window.matchMedia(DESKTOP_QUERY);
    const reducedMotion = window.matchMedia(REDUCED_MOTION_QUERY);

    function sync() {
      setIsDesktop(desktop.matches);
      setIsReducedMotion(reducedMotion.matches);
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

    // The label follows the element's own play and pause events, so a rejected
    // play() leaves the control saying Play.
    if (element.paused) {
      element.play().catch(() => setIsPlaying(false));
    } else {
      element.pause();
    }
  }

  function handleSelect(index: number) {
    if (index === activeIndex) {
      const element = videoRef.current;
      if (element) {
        element.currentTime = 0;
        element.play().catch(() => setIsPlaying(false));
      }
      setProgress(0);
      return;
    }

    setActiveIndex(index);
    setProgress(0);
  }

  function handleEnded() {
    setActiveIndex((index) => (index + 1) % slides.length);
    setProgress(0);
  }

  if (!activeSlide) {
    return null;
  }

  return (
    <div
      aria-label={regionLabel}
      className="relative h-full min-h-[calc(100vh-1.5rem)] overflow-hidden rounded-2xl border border-border bg-black"
      role="region"
    >
      <Image
        key={activeSlide.id}
        src={activeSlide.posterSrc}
        alt=""
        fill
        priority={activeIndex === 0}
        unoptimized
        sizes="(min-width: 1024px) 55vw, 0px"
        className="object-cover"
      />
      {isVideoEnabled ? (
        <>
          <div className="absolute inset-0">
            <VideoPlayer
              key={activeSlide.id}
              config={{
                ...BACKGROUND_VIDEO_CONFIG,
                loop: slides.length === 1,
              }}
              mediaClassName="object-cover"
              mediaProps={{
                'aria-hidden': true,
                onEnded: handleEnded,
                onPause: () => setIsPlaying(false),
                onPlay: () => setIsPlaying(true),
                onTimeUpdate: (event) => {
                  const { currentTime, duration } = event.currentTarget;
                  setProgress(
                    Number.isFinite(duration) && duration > 0
                      ? Math.min(currentTime / duration, 1)
                      : 0,
                  );
                },
                poster: activeSlide.posterSrc,
              }}
              src={activeSlide.videoSrc}
              videoRef={videoRef}
            />
          </div>
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

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col gap-4 bg-gradient-to-t from-black/85 via-black/45 to-transparent p-6 pt-32 text-white">
        <div className="flex flex-col items-start gap-3">
          <span className="rounded-full border border-white/25 bg-black/40 px-3 py-1 text-xs font-medium backdrop-blur">
            {activeSlide.modelLabel}
          </span>
          <p className="text-2xl font-semibold tracking-tight">
            {activeSlide.caption}
          </p>
        </div>

        <div className="pointer-events-auto flex gap-2">
          {slides.map((slide, index) => {
            const isActive = index === activeIndex;
            const fill = index < activeIndex ? 1 : isActive ? progress : 0;

            return (
              <Button
                key={slide.id}
                ariaLabel={slide.selectLabel}
                aria-current={isActive ? 'true' : undefined}
                className="flex min-w-0 flex-1 flex-col items-stretch gap-2 text-left"
                onClick={() => handleSelect(index)}
                textTransform="none"
                type="button"
                variant={ButtonVariant.UNSTYLED}
                withWrapper={false}
              >
                <span
                  aria-hidden="true"
                  className="block h-0.5 overflow-hidden rounded-full bg-white/25"
                >
                  <span
                    className="block h-full origin-left rounded-full bg-white transition-transform duration-300 ease-linear"
                    style={{ transform: `scaleX(${fill})` }}
                  />
                </span>
                <span
                  aria-hidden="true"
                  className={cn(
                    'truncate text-xs transition-colors',
                    isActive ? 'text-white' : 'text-white/60',
                  )}
                >
                  {slide.modelLabel}
                </span>
              </Button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
