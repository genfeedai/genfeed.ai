'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type { HeroVideoProps } from '@props/website/home.props';
import { Button } from '@ui/primitives/button';
import { Pause, Play } from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Below this width the clip is never fetched. A full-bleed background video is
 * decoration on a phone — it costs a megabyte on a cellular connection, heats
 * the device, and is mostly hidden behind the headline anyway. Small screens
 * get the poster still, which they were going to paint first regardless.
 */
const VIDEO_MIN_WIDTH_QUERY = '(min-width: 768px)';

/**
 * Full-bleed hero background: poster still on the server, generated clip layered
 * over it on the client.
 *
 * The poster is frame 0 of the encoded MP4 (see `scripts/generate-hero-video.ts`),
 * so the handoff from still to playback is seamless by construction rather than
 * by eyeballing — there is no cross-fade to tune, because the two images are the
 * same pixels. The still is the server-rendered LCP element and is the only
 * thing slow connections, small screens, and reduced-motion visitors ever load.
 */
export default function HomeHeroVideo({
  alt,
  mp4Src,
  posterSrc,
  webmSrc,
}: HeroVideoProps): React.ReactElement {
  const [isVideoEnabled, setIsVideoEnabled] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const reducedMotion = window.matchMedia(REDUCED_MOTION_QUERY);
    const wideEnough = window.matchMedia(VIDEO_MIN_WIDTH_QUERY);
    // `saveData` is Chromium-only and absent elsewhere; an absent flag means
    // "no stated preference", which is not the same as "wants the video".
    const isSavingData =
      (navigator as Navigator & { connection?: { saveData?: boolean } })
        .connection?.saveData === true;

    const sync = () => {
      setIsVideoEnabled(
        !reducedMotion.matches && wideEnough.matches && !isSavingData,
      );
    };

    sync();
    reducedMotion.addEventListener('change', sync);
    wideEnough.addEventListener('change', sync);

    return () => {
      reducedMotion.removeEventListener('change', sync);
      wideEnough.removeEventListener('change', sync);
    };
  }, []);

  const toggle = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      void video.play();
      return;
    }

    video.pause();
    setIsPlaying(false);
  }, []);

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      data-testid="home-hero-video"
    >
      <Image
        alt={alt}
        className="object-cover"
        fill
        priority
        sizes="100vw"
        src={posterSrc}
      />

      {isVideoEnabled ? (
        <video
          autoPlay
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${
            isPlaying ? 'opacity-100' : 'opacity-0'
          }`}
          data-testid="home-hero-video-player"
          loop
          muted
          onPause={() => setIsPlaying(false)}
          onPlaying={() => setIsPlaying(true)}
          playsInline
          poster={posterSrc}
          preload="auto"
          ref={videoRef}
        >
          <source src={webmSrc} type="video/webm" />
          <source src={mp4Src} type="video/mp4" />
          <track kind="captions" />
        </video>
      ) : null}

      {/*
        Two overlays, not one. The vertical gradient keeps the headline legible
        against whatever the generated frame happens to be doing, while the flat
        scrim floors the whole frame so the CTA row at the bottom never lands on
        a blown highlight.
      */}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,6,7,0.88)_0%,rgba(5,6,7,0.62)_45%,rgba(5,6,7,0.94)_100%)]" />
      <div className="absolute inset-0 bg-background/35" />

      {/*
        WCAG 2.2.2: moving content that starts on its own and runs past five
        seconds needs a way to stop it. The control only exists when the clip
        does — reduced-motion and small-screen visitors have nothing to pause.
      */}
      {isVideoEnabled ? (
        <Button
          aria-label={
            isPlaying ? 'Pause background video' : 'Play background video'
          }
          className="pointer-events-auto absolute bottom-5 right-5 z-10 grid h-9 w-9 place-items-center rounded-full border border-edge/10 bg-background/60 text-surface/60 backdrop-blur transition-colors hover:text-surface focus-visible:text-surface"
          data-testid="home-hero-video-toggle"
          onClick={toggle}
          textTransform="none"
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
        >
          {isPlaying ? (
            <Pause aria-hidden="true" className="h-4 w-4" />
          ) : (
            <Play aria-hidden="true" className="h-4 w-4" />
          )}
        </Button>
      ) : null}
    </div>
  );
}
