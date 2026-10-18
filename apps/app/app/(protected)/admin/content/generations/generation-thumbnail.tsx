'use client';

import type { GenerationView } from '@props/admin/generations.props';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import { FileText, Music } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';

const MEDIA_PLACEHOLDER_ICON_CLASS = 'size-5 text-muted-foreground';

/**
 * The asset at its own aspect ratio inside a fixed-width frame. A prompt with
 * no generation, a missing file and audio all get a placeholder so every row
 * keeps the same shape.
 */
export default function GenerationThumbnail({
  generation,
  className,
  sizes = 104,
}: {
  generation: GenerationView;
  className?: string;
  sizes?: number;
}) {
  const t = useTranslations('pages.adminGenerations');
  const { aspectRatio, mediaKind, mediaUrl, original } = generation;

  return (
    <div
      className={`flex w-full items-center justify-center overflow-hidden rounded-md bg-tertiary ${className ?? ''}`}
      data-testid="generation-thumbnail"
      style={{ aspectRatio: String(aspectRatio) }}
    >
      {mediaKind === 'image' ? (
        <Image
          alt={original || t('resultAlt')}
          className="size-full object-cover"
          height={Math.round(sizes / aspectRatio)}
          src={mediaUrl}
          unoptimized
          width={sizes}
        />
      ) : mediaKind === 'video' ? (
        <VideoPlayer
          ariaLabel={original || t('resultAlt')}
          className="size-full"
          config={{
            controls: false,
            loop: false,
            muted: true,
            playsInline: true,
            preload: 'metadata',
          }}
          src={mediaUrl}
        />
      ) : mediaKind === 'audio' ? (
        <Music
          aria-label={t('audio')}
          className={MEDIA_PLACEHOLDER_ICON_CLASS}
        />
      ) : (
        <FileText
          aria-label={t('noMedia')}
          className={MEDIA_PLACEHOLDER_ICON_CLASS}
        />
      )}
    </div>
  );
}
