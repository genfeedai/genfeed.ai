'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { getPlatformPreviewLimit } from '@genfeedai/contracts/constants/platform-limits.constant';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type {
  PlatformPreviewMediaGridProps,
  PlatformPreviewMediaTileProps,
} from '@genfeedai/props/components/platform-preview.props';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import { PreviewPresentation } from '@ui/posts/platform-preview/PlatformPreview.context';
import { resolvePreviewPlatform } from '@ui/posts/platform-preview/PlatformPreview.data';
import { Button } from '@ui/primitives/button';
import { Play } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { useContext, useState } from 'react';

export function MediaTile({
  item,
  index,
  className,
  animatedConsequence,
  intrinsic = false,
}: PlatformPreviewMediaTileProps) {
  const translate = useTranslations('ui.platformPreview');
  const { renderMedia, presentation } = useContext(PreviewPresentation);
  const [isPlaybackRequested, setIsPlaybackRequested] = useState(false);
  const [imageAspect, setImageAspect] = useState<number>();
  const isVideo = item.kind === 'video' || item.kind === 'short_video';
  const src = item.thumbnailUrl ?? item.url;
  const label = item.kind.replace('_', ' ');
  const consequence = item.isAnimated ? animatedConsequence : undefined;

  return (
    <div
      className={cn(
        'relative flex items-center justify-center overflow-hidden rounded-lg bg-muted text-xs text-muted-foreground',
        !intrinsic ? 'min-h-24' : 'aspect-square',
        consequence ? 'ring-1 ring-warning/50' : undefined,
        className,
      )}
      style={
        intrinsic && imageAspect ? { aspectRatio: imageAspect } : undefined
      }
      onLoadCapture={(event) => {
        const image = event.target;
        if (
          intrinsic &&
          image instanceof HTMLImageElement &&
          image.naturalWidth &&
          image.naturalHeight
        )
          setImageAspect(image.naturalWidth / image.naturalHeight);
      }}
      data-testid={`platform-preview-media-${item.id}`}
    >
      {renderMedia ? (
        renderMedia(item, index)
      ) : isVideo &&
        item.url &&
        presentation === 'compact' &&
        !isPlaybackRequested ? (
        <Button
          ariaLabel={item.alt ?? translate('videoAlt', { count: index + 1 })}
          className="absolute inset-0 size-full rounded-none"
          onClick={() => setIsPlaybackRequested(true)}
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
        >
          {item.thumbnailUrl ? (
            <Image
              src={item.thumbnailUrl}
              alt=""
              fill
              sizes="320px"
              className="object-cover"
            />
          ) : null}
          <span className="relative flex size-10 items-center justify-center rounded-full bg-background/80 text-foreground shadow-border">
            <Play className="size-5" />
          </span>
        </Button>
      ) : isVideo && item.url ? (
        <VideoPlayer
          src={item.url}
          thumbnail={item.thumbnailUrl}
          mediaClassName="object-cover"
          mediaProps={{
            autoPlay: presentation === 'compact' && isPlaybackRequested,
          }}
          ariaLabel={item.alt ?? translate('videoAlt', { count: index + 1 })}
        />
      ) : src ? (
        <Image
          src={src}
          alt={item.alt ?? translate('mediaAlt', { count: index + 1 })}
          fill
          sizes="(max-width: 768px) 100vw, 360px"
          className="object-cover outline-media"
        />
      ) : (
        <span className="capitalize">{label}</span>
      )}
      {isVideo && !item.url ? (
        <span
          className={
            'absolute inset-0 flex items-center justify-center bg-black/20 text-white' /* design-system-allow-content-color -- media overlay */
          }
        >
          <Play className="size-6" />
        </span>
      ) : null}
      <div className="absolute bottom-2 left-2 flex flex-wrap gap-1">
        {item.isAnimated ? (
          <span
            className={
              'rounded bg-black/70 px-1.5 py-0.5 text-2xs font-medium text-white' /* design-system-allow-content-color -- media overlay */
            }
          >
            {translate('animated')}
          </span>
        ) : null}
        {item.durationLabel ? (
          <span
            className={
              'rounded bg-black/70 px-1.5 py-0.5 text-2xs font-medium text-white' /* design-system-allow-content-color -- media overlay */
            }
          >
            {item.durationLabel}
          </span>
        ) : null}
      </div>
      {consequence ? (
        <span className="absolute inset-x-0 bottom-0 bg-warning/90 px-2 py-1 text-left text-2xs font-medium leading-tight text-warning-foreground">
          {consequence}
        </span>
      ) : null}
    </div>
  );
}

export default function MediaGrid({
  target,
  variant = 'grid',
}: PlatformPreviewMediaGridProps) {
  const translate = useTranslations('ui.platformPreview');
  const { headerPresentation } = useContext(PreviewPresentation);
  const mediaMargin = headerPresentation === 'account' ? undefined : 'mt-3';
  const platform = resolvePreviewPlatform(target.platform);
  const aspect = platform
    ? getPlatformPreviewLimit(platform)?.mediaAspect
    : undefined;
  const maxItems = target.capability?.media.maxItems;
  const visibleMedia = maxItems
    ? target.media.slice(0, maxItems)
    : target.media;
  const overflowCount =
    maxItems && target.media.length > maxItems
      ? target.media.length - maxItems
      : 0;
  const animated = target.capability?.media.animated;
  const animatedConsequence = animated?.supported
    ? undefined
    : animated?.consequence;

  if (target.media.length === 0) {
    if ((target.capability?.media.minItems ?? 0) > 0) {
      return (
        <div
          className={cn(
            'mt-3 flex items-center justify-center rounded-lg border border-dashed border-border bg-muted/40 text-sm text-muted-foreground',
            variant === 'vertical' ? 'aspect-[9/16]' : 'aspect-video',
          )}
        >
          {translate('mediaRequired')}
        </div>
      );
    }

    return null;
  }

  if (variant === 'vertical') {
    return (
      <div data-testid="preview-media" data-media-aspect={aspect}>
        <MediaTile
          item={visibleMedia[0]}
          index={0}
          animatedConsequence={animatedConsequence}
          className="aspect-[9/16]"
        />
      </div>
    );
  }

  if (variant === 'video') {
    return (
      <div
        className="mt-3"
        data-testid="preview-media"
        data-media-aspect={aspect}
      >
        <MediaTile
          item={visibleMedia[0]}
          index={0}
          animatedConsequence={animatedConsequence}
          className="aspect-video min-h-40"
        />
      </div>
    );
  }

  const gridClassName =
    variant === 'square'
      ? 'grid-cols-1'
      : visibleMedia.length === 1
        ? 'grid-cols-1'
        : 'grid-cols-2';

  return (
    <div
      className={cn(mediaMargin, 'grid gap-1.5', gridClassName)}
      data-testid="preview-media"
      data-media-aspect={aspect}
    >
      {visibleMedia.map((item, index) => (
        <MediaTile
          key={item.id}
          item={item}
          index={index}
          animatedConsequence={animatedConsequence}
          intrinsic={visibleMedia.length === 1 && item.kind === 'image'}
          className={
            visibleMedia.length === 1 && item.kind === 'image'
              ? undefined
              : variant === 'square'
                ? 'aspect-square'
                : 'aspect-video'
          }
        />
      ))}
      {overflowCount > 0 ? (
        <div className="flex min-h-20 items-center justify-center rounded-lg bg-muted text-xs font-medium text-foreground/70">
          {translate('moreMedia', { count: overflowCount })}
        </div>
      ) : null}
    </div>
  );
}
