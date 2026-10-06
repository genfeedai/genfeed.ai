'use client';

import { getPlatformIcon } from '@helpers/ui/platform-icon/platform-icon.helper';
import { getDeskMediaSource } from '@pages/trends/desk/desk-media-source';
import type { DeskMediaPreviewProps } from '@props/trends/discovery-desk.props';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

export default function DeskMediaPreview({
  item,
  isActive,
  className = '',
}: DeskMediaPreviewProps) {
  const { directUrl, embedUrl, thumbnail } = getDeskMediaSource(item);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isReady, setIsReady] = useState(false);
  const [isInViewport, setIsInViewport] = useState(true);
  const [isVisible, setIsVisible] = useState(true);
  const [failedThumbnail, setFailedThumbnail] = useState<string | null>(null);
  const [failedPlayback, setFailedPlayback] = useState<string | null>(null);
  const playbackUrl = directUrl || embedUrl;

  useEffect(() => {
    if (!isActive) {
      setIsReady(false);
      return;
    }
    const timer = setTimeout(() => setIsReady(true), 200);
    return () => clearTimeout(timer);
  }, [isActive]);

  useEffect(() => {
    const updateVisibility = () => setIsVisible(!document.hidden);
    updateVisibility();
    document.addEventListener('visibilitychange', updateVisibility);
    return () =>
      document.removeEventListener('visibilitychange', updateVisibility);
  }, []);

  useEffect(() => {
    if (!containerRef.current || typeof IntersectionObserver === 'undefined')
      return;
    const observer = new IntersectionObserver(([entry]) => {
      setIsInViewport(entry.isIntersecting);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const isPlaying =
    isActive &&
    isReady &&
    isVisible &&
    isInViewport &&
    failedPlayback !== playbackUrl;
  return (
    <div
      ref={containerRef}
      className={`relative aspect-video w-full overflow-hidden rounded-lg bg-secondary ${className}`}
    >
      {thumbnail && failedThumbnail !== thumbnail ? (
        <Image
          alt={item.title || item.text || ''}
          className="object-cover"
          fill
          sizes="(min-width: 1280px) 25vw, (min-width: 768px) 33vw, 100vw"
          src={thumbnail}
          unoptimized
          onError={() => setFailedThumbnail(thumbnail)}
        />
      ) : (
        <div className="flex size-full items-center justify-center text-foreground/40">
          {getPlatformIcon(item.platform, 'size-8')}
        </div>
      )}
      {isPlaying && directUrl ? (
        <VideoPlayer
          src={directUrl}
          thumbnail={thumbnail || ''}
          mediaProps={{ onError: () => setFailedPlayback(playbackUrl) }}
          config={{
            autoPlay: true,
            controls: false,
            loop: true,
            muted: true,
            playsInline: true,
            preload: 'none',
          }}
          className="pointer-events-none absolute inset-0"
        />
      ) : isPlaying && embedUrl ? (
        <iframe
          tabIndex={-1}
          allow="autoplay; encrypted-media; fullscreen"
          className="pointer-events-none absolute inset-0 size-full border-0"
          src={embedUrl}
          title={item.title || 'Video preview'}
          referrerPolicy="strict-origin-when-cross-origin"
          onError={() => setFailedPlayback(playbackUrl)}
        />
      ) : null}
    </div>
  );
}
