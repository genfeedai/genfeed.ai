'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import {
  getSocialMediaSource,
  isPlaybackSourceUrl,
} from '@genfeedai/helpers/media/social-media-source.helper';
import { useOrgUrl } from '@hooks/navigation/use-org-url';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import { Button } from '@ui/primitives/button';
import Spinner from '@ui/primitives/spinner';
import { ExternalLink, Play } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { useTrendVideoPlayback } from '@/features/trends/hooks/use-trend-video-playback/use-trend-video-playback';
import type { SocialMediaPlayerProps } from '@/props/analytics/trends.props';

type PreparePhase = 'idle' | 'preparing' | 'upgrade' | 'unavailable';

export default function SocialMediaPlayer({
  title = 'Video',
  className = '',
  trendVideoId,
  playbackUrl,
  ...source
}: SocialMediaPlayerProps) {
  const translate = useTranslations('ui.discovery');
  const { orgHref } = useOrgUrl();
  const prepareVideo = useTrendVideoPlayback();
  const { directUrl, embedUrl, thumbnail, sourceUrl } =
    getSocialMediaSource(source);
  const [isPlaying, setPlaying] = useState(false);
  const [directFailed, setDirectFailed] = useState(false);
  const [embedFailed, setEmbedFailed] = useState(false);
  const [phase, setPhase] = useState<PreparePhase>('idle');
  const [preparedUrl, setPreparedUrl] = useState<string | null>(null);
  const activeDirect = directFailed
    ? null
    : (preparedUrl ?? playbackUrl ?? directUrl);
  const canPrepare =
    !activeDirect &&
    !embedUrl &&
    !directFailed &&
    Boolean(trendVideoId) &&
    isPlaybackSourceUrl(sourceUrl);
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

  const handlePlay = async () => {
    if (activeDirect || embedUrl) {
      setPlaying(true);
      return;
    }
    if (!canPrepare || !trendVideoId) return;
    setPhase('preparing');
    const result = await prepareVideo(trendVideoId);
    if (result.status === 'ready') {
      setPreparedUrl(result.playbackUrl);
      setPhase('idle');
      setPlaying(true);
      return;
    }
    setPhase(result.status);
  };

  const isPlayable = Boolean(activeDirect || embedUrl || canPrepare);
  return (
    <div ref={container} className={`space-y-2 ${className}`}>
      <div className="relative aspect-video overflow-hidden rounded-lg bg-muted">
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
            {phase === 'preparing' ? (
              <div
                className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background/70 text-sm"
                role="status"
              >
                <Spinner />
                <span>{translate('preparingVideo')}</span>
              </div>
            ) : phase === 'upgrade' ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/80 p-4 text-center text-sm">
                <p>{translate('playbackUpgrade')}</p>
                <Button asChild size={ButtonSize.SM} withWrapper={false}>
                  <Link href={orgHref(APP_ROUTES.SETTINGS.SUBSCRIPTION)}>
                    {translate('viewPlans')}
                  </Link>
                </Button>
              </div>
            ) : source.contentType === 'video' &&
              isPlayable &&
              !hasError &&
              phase !== 'unavailable' ? (
              <Button
                aria-label={translate('playVideo', { title })}
                variant={ButtonVariant.UNSTYLED}
                className="absolute inset-0 flex size-full items-center justify-center bg-background/20"
                withWrapper={false}
                onClick={() => void handlePlay()}
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
      ) : phase === 'unavailable' ? (
        <p className="text-xs text-muted-foreground">
          {translate('playbackUnavailable')}
        </p>
      ) : null}
    </div>
  );
}
