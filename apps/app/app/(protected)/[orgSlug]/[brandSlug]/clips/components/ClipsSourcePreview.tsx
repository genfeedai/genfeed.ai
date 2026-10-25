'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type { ClipsSourcePreviewProps } from '@props/studio/clips.props';
import AudioPreviewPlayer from '@ui/audio/preview-player/AudioPreviewPlayer';
import Card from '@ui/card/Card';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import { Button } from '@ui/primitives/button';
import { Film, Play } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  extractYoutubeVideoId,
  youtubeThumbnailUrl,
} from '../utils/youtube-thumbnail';

export default function ClipsSourcePreview({
  name,
  sourceVideoUrl,
  source,
  transcriptText,
}: ClipsSourcePreviewProps) {
  const t = useTranslations('pages.studioClips');
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);
  let youtubeId: string | undefined;
  try {
    const url = new URL(sourceVideoUrl ?? '');
    if (
      ['https:', 'http:'].includes(url.protocol) &&
      ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(
        url.hostname,
      )
    )
      youtubeId = extractYoutubeVideoId(sourceVideoUrl);
  } catch {
    /* An absent or unfinished draft URL has no preview. */
  }
  const thumbnail = youtubeId ? youtubeThumbnailUrl(sourceVideoUrl) : undefined;
  const mediaUrl = source?.artifact?.mediaUrl;
  const contentType = source?.artifact?.contentType ?? source?.contentType;
  const title = name || source?.filename || t('source');
  return (
    <Card bodyClassName="space-y-4 p-4" data-testid="clips-source-preview">
      <h2 className="break-words text-base font-semibold">{title}</h2>
      {youtubeId && playingUrl === sourceVideoUrl ? (
        <iframe
          className="aspect-video w-full rounded-md border-0"
          src={`https://www.youtube-nocookie.com/embed/${youtubeId}`}
          title={t('sourceVideoPreview')}
          allow="encrypted-media; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ) : thumbnail ? (
        <Button
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
          ariaLabel={t('playSourceVideo')}
          className="relative aspect-video w-full overflow-hidden rounded-md"
          onClick={() => setPlayingUrl(sourceVideoUrl ?? null)}
        >
          <Image
            src={thumbnail}
            alt={title}
            fill
            unoptimized
            sizes="(min-width: 1024px) 40vw, 100vw"
            className="object-cover"
          />
          <Play className="absolute left-1/2 top-1/2 size-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-background/80 p-2" />
        </Button>
      ) : mediaUrl && contentType?.startsWith('audio/') ? (
        <AudioPreviewPlayer
          audioUrl={mediaUrl}
          label={title}
          isTimelineVisible
          stopOnUnmount
        />
      ) : mediaUrl && contentType?.startsWith('video/') ? (
        <VideoPlayer
          src={mediaUrl}
          config={{
            autoPlay: false,
            controls: true,
            muted: false,
            loop: false,
            playsInline: true,
            preload: 'none',
          }}
        />
      ) : (
        <div className="flex aspect-video items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Film className="size-8" />
        </div>
      )}
      {youtubeId && sourceVideoUrl ? (
        <a
          href={`https://www.youtube.com/watch?v=${youtubeId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block break-all text-xs text-muted-foreground underline"
        >
          {sourceVideoUrl}
        </a>
      ) : null}
      <div className="space-y-2">
        <h3 className="text-sm font-medium">{t('transcript')}</h3>
        {transcriptText?.trim() ? (
          <p className="max-h-96 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
            {transcriptText}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t('transcriptPending')}
          </p>
        )}
      </div>
    </Card>
  );
}
