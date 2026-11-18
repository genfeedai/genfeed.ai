'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import MediaPlayer from '@ui/media-player/MediaPlayer';
import { Button } from '@ui/primitives/button';
import { RotateCcw } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import { studioAssetAccessibleLabel } from '@/features/studio/playground/utils/studio-playground-recipe';
import type { StudioInspectorPreviewProps } from '@/features/studio/props/studio-playground-inspector.props';

const AUDIO_TYPES = new Set(['music', 'voice']);

/** The asset's preview, or why there is none yet: loading, unsupported or failed. */
export default function StudioInspectorPreview({
  hasPreviewError,
  ingredient,
  isFocused,
  isPreviewLoading,
  isPreviewUnsupported,
  isReady,
  job,
  label,
  onMediaMeasured,
  onPreviewFailed,
  onPreviewLoaded,
  onRetry,
  previewRevision,
  previewScope,
  previewUrl,
}: StudioInspectorPreviewProps): ReactElement | null {
  const translate = useTranslations('pages.studioPlayground');
  if (!isReady) {
    return null;
  }
  if (hasPreviewError || isPreviewUnsupported || isPreviewLoading) {
    return (
      <div className="flex aspect-video flex-col items-center justify-center gap-2 rounded-md bg-foreground/5 px-4 text-center">
        <p role="status" className="text-xs text-muted-foreground">
          {translate(
            isPreviewLoading
              ? 'inspector.previewLoading'
              : isPreviewUnsupported
                ? 'inspector.previewUnsupported'
                : 'inspector.previewFailed',
          )}
        </p>
        {!isPreviewUnsupported ? (
          <Button
            icon={<RotateCcw className="size-3.5" />}
            isDisabled={isPreviewLoading || !ingredient}
            label={translate('inspector.retryPreview')}
            onClick={onRetry}
            size={ButtonSize.SM}
            variant={ButtonVariant.SECONDARY}
            withWrapper={false}
          />
        ) : null}
      </div>
    );
  }
  if (!previewUrl) {
    return null;
  }
  if (AUDIO_TYPES.has(job.type)) {
    return (
      <MediaPlayer
        src={previewUrl}
        className="w-full"
        variant="inspector"
        label={studioAssetAccessibleLabel(job)}
      />
    );
  }
  const frameClassName = isFocused
    ? 'h-[min(62vh,42rem)] min-h-56'
    : 'aspect-video';
  if (job.type === 'image' || job.type === 'image-edit') {
    return (
      <div
        className={`relative w-full overflow-hidden rounded-md bg-foreground/5 ${frameClassName}`}
      >
        <Image
          key={`${previewScope}:${previewRevision}`}
          alt={translate('inspector.previewAlt', { label })}
          className="object-contain"
          fill
          sizes={isFocused ? '(min-width: 1024px) 65vw, 100vw' : '480px'}
          src={previewUrl}
          onError={onPreviewFailed}
          onLoad={(event) => {
            onMediaMeasured(
              event.currentTarget.naturalWidth,
              event.currentTarget.naturalHeight,
            );
            onPreviewLoaded();
          }}
        />
      </div>
    );
  }
  return (
    <VideoPlayer
      key={`${previewScope}:${previewRevision}`}
      ariaLabel={translate('inspector.previewAlt', { label })}
      className={`w-full overflow-hidden rounded-md bg-foreground/5 ${frameClassName}`}
      config={{
        controls: true,
        loop: false,
        muted: true,
        playsInline: true,
        preload: 'metadata',
      }}
      src={previewUrl}
      mediaProps={{
        onError: onPreviewFailed,
        onLoadedData: onPreviewLoaded,
        onLoadedMetadata: (event) =>
          onMediaMeasured(
            event.currentTarget.videoWidth,
            event.currentTarget.videoHeight,
          ),
      }}
      onPlaybackError={onPreviewFailed}
      thumbnail={ingredient?.thumbnailUrl}
    />
  );
}
