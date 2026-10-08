'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { getSocialMediaSource } from '@genfeedai/helpers/media/social-media-source.helper';
import type { SocialMediaPlayerProps } from '@genfeedai/props/analytics/trends.props';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import { Button } from '@ui/primitives/button';
import { ExternalLink, Play } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

export default function SocialMediaPlayer({
  title = 'Video',
  className = '',
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
  return (
    <div ref={container} className={`space-y-2 ${className}`}>
      <div className="relative aspect-video overflow-hidden rounded-lg bg-secondary">
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
            {source.contentType === 'video' &&
            (directUrl || embedUrl) &&
            !hasError ? (
              <Button
                aria-label={translate('playVideo', { title })}
                variant={ButtonVariant.UNSTYLED}
                className="absolute inset-0 flex size-full items-center justify-center bg-background/30"
                withWrapper={false}
                onClick={() => setPlaying(true)}
              >
                <Play className="size-10" />
              </Button>
            ) : null}
          </>
        )}
      </div>
      {hasError ? (
        <p className="text-xs text-muted-foreground">
          {translate('previewError')}
        </p>
      ) : null}
      {sourceUrl ? (
        <a
          href={sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ExternalLink className="size-3" />
          {translate('openSource')}
        </a>
      ) : null}
    </div>
  );
}
