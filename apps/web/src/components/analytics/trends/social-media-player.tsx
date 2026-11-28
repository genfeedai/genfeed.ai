'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { getSocialMediaSource } from '@genfeedai/helpers/media/social-media-source.helper';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import { Button } from '@ui/primitives/button';
import { ExternalLink, Play } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import type { SocialMediaPlayerProps } from '@/props/analytics/trends.props';

export default function SocialMediaPlayer({
  title = 'Video',
  className = '',
  isPortrait = false,
  ...source
}: SocialMediaPlayerProps) {
  const translate = useTranslations('ui.discovery');
  const { directUrl, embedUrl, thumbnail, sourceUrl } =
    getSocialMediaSource(source);
  const [isPlaying, setPlaying] = useState(false);
  const [directFailed, setDirectFailed] = useState(false);
  const [embedFailed, setEmbedFailed] = useState(false);
  const activeDirect = directFailed ? null : directUrl;
  const hasError =
    (directFailed || embedFailed) &&
    !activeDirect &&
    (!embedUrl || embedFailed);
  const [isVisible, setVisible] = useState(true);
  const container = useRef<HTMLDivElement>(null);
  // use-effect-audit: ignore observes DOM elements with a browser observer
  useEffect(() => {
    const visibility = () => {
      if (document.hidden) setPlaying(false);
    };
    document.addEventListener('visibilitychange', visibility);
    const observer =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(([entry]) => {
            setVisible(entry.isIntersecting);
            if (!entry.isIntersecting) setPlaying(false);
          });
    if (container.current) observer?.observe(container.current);
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      observer?.disconnect();
    };
  }, []);

  const isPlayable = Boolean(activeDirect || embedUrl);
  return (
    <div ref={container} className={`space-y-2 ${className}`}>
      <div
        className={`relative overflow-hidden rounded-lg bg-muted ${isPortrait ? 'aspect-[9/16]' : 'aspect-video'}`}
      >
        {isPlaying && isVisible && !hasError ? (
          activeDirect ? (
            <VideoPlayer
              src={activeDirect}
              thumbnail={thumbnail ?? ''}
              ariaLabel={title}
              config={{
                controls: true,
                muted: false,
                loop: false,
                playsInline: true,
                autoPlay: true,
                preload: 'metadata',
              }}
              onPlaybackError={() => setDirectFailed(true)}
              className="size-full"
            />
          ) : embedUrl ? (
            <iframe
              src={embedUrl}
              title={title}
              className="size-full border-0"
              allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              onError={() => setEmbedFailed(true)}
            />
          ) : null
        ) : (
          <>
            {thumbnail ? (
              <Image
                src={thumbnail}
                alt={title}
                fill
                unoptimized
                sizes="(max-width: 768px) 100vw, 33vw"
                className="object-cover"
              />
            ) : null}
            {source.contentType === 'video' && isPlayable && !hasError ? (
              <Button
                aria-label={translate('playVideo', { title })}
                variant={ButtonVariant.UNSTYLED}
                className="absolute inset-0 flex size-full items-center justify-center bg-background/20"
                withWrapper={false}
                onClick={() => setPlaying(true)}
              >
                <Play className="size-10" />
              </Button>
            ) : null}
          </>
        )}
        {sourceUrl ? (
          <Button
            asChild
            ariaLabel={translate('openSource')}
            className="absolute top-2 right-2 z-10"
            size={ButtonSize.ICON}
            tooltip={translate('openSource')}
            tooltipPosition="left"
            variant={ButtonVariant.OVERLAY}
            withWrapper={false}
          >
            <a href={sourceUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="size-4" />
            </a>
          </Button>
        ) : null}
      </div>
      {hasError ? (
        <p className="text-xs text-muted-foreground">
          {translate('previewError')}
        </p>
      ) : null}
    </div>
  );
}
