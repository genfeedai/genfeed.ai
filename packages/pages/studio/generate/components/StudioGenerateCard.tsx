'use client';

import { ButtonSize, ButtonVariant, IngredientStatus } from '@genfeedai/enums';
import type { IImage, IMetadata, IVideo } from '@genfeedai/interfaces';
import { Image as IngredientImage } from '@genfeedai/models/ingredients/image.model';
import { Video } from '@genfeedai/models/ingredients/video.model';
import type { StudioGenerateCardProps } from '@genfeedai/props/studio/studio-generate.props';
import { getStudioGenerateTypeConfig } from '@pages/studio/generate/utils/studio-generate-types';
import {
  LazyMasonryImage,
  LazyMasonryVideo,
} from '@ui/lazy/masonry/LazyMasonry';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import { AlertTriangle, Loader2, RotateCcw, Trash2 } from 'lucide-react';
import NextImage from 'next/image';
import { useTranslations } from 'next-intl';
import { type ReactElement, useCallback, useMemo, useState } from 'react';

const AUDIO_TYPES = new Set(['music', 'voice']);
const VIDEO_TYPES = new Set(['video', 'avatar']);
const MODEL_GETTER_FIELDS = new Set([
  '_ingredientUrl',
  'aspectRatio',
  'brandLogoUrl',
  'ingredientFormat',
  'ingredientUrl',
  'metadataDescription',
  'metadataDuration',
  'metadataExtension',
  'metadataHeight',
  'metadataLabel',
  'metadataModel',
  'metadataModelLabel',
  'metadataSize',
  'metadataStyle',
  'metadataTags',
  'metadataWidth',
  'primaryReference',
  'primaryReferenceUrl',
  'promptText',
  'thumbnailUrl',
]);

function buildMasonryIngredient(
  job: StudioGenerateCardProps['job'],
): IImage | IVideo | null {
  if (!job.ingredient || (job.type !== 'image' && !VIDEO_TYPES.has(job.type))) {
    return null;
  }

  const sourceMetadata =
    typeof job.ingredient.metadata === 'object'
      ? job.ingredient.metadata
      : undefined;
  const metadata =
    sourceMetadata?.width && sourceMetadata?.height
      ? sourceMetadata
      : job.width && job.height
        ? ({
            ...sourceMetadata,
            height: job.height,
            width: job.width,
          } as IMetadata)
        : sourceMetadata;
  const persistedIngredient = Object.fromEntries(
    Object.entries(job.ingredient).filter(
      ([key]) => !MODEL_GETTER_FIELDS.has(key),
    ),
  );
  const ingredient = {
    ...persistedIngredient,
    cdnUrl: job.url || job.ingredient.cdnUrl,
    metadata,
    prompt: job.ingredient.prompt || job.prompt,
  };

  return job.type === 'image'
    ? new IngredientImage(ingredient as IImage)
    : new Video(ingredient as IVideo);
}

/**
 * One asset in the results grid. A card is the whole lifecycle — queued,
 * rendered, or failed — so a generation never disappears and reappears
 * somewhere else once the socket resolves it.
 */
export default function StudioGenerateCard({
  assetActions,
  job,
  onReprompt,
}: StudioGenerateCardProps): ReactElement {
  const translate = useTranslations('pages.studioGenerate');
  const { label } = getStudioGenerateTypeConfig(job.type);
  const [failedMediaUrl, setFailedMediaUrl] = useState<string | null>(null);
  const isFailed = job.status === IngredientStatus.FAILED;
  const isPending =
    job.status === IngredientStatus.PROCESSING ||
    job.status === IngredientStatus.DRAFT;
  const isPreviewUnavailable =
    !isPending && !isFailed && (!job.url || failedMediaUrl === job.url);
  const mediaState = isPending
    ? 'processing'
    : isFailed
      ? 'failed'
      : isPreviewUnavailable
        ? 'fallback'
        : 'ready';
  const width = Math.max(1, job.width || 1080);
  const height = Math.max(1, job.height || 1080);
  const masonryIngredient = useMemo(() => buildMasonryIngredient(job), [job]);

  const handleMediaError = useCallback(() => {
    if (job.url) {
      setFailedMediaUrl(job.url);
    }
  }, [job.url]);

  if (mediaState === 'ready' && masonryIngredient) {
    const sharedProps = {
      isActionsEnabled: true,
      isContainerHovered: true,
      isDragEnabled: false,
      onClickIngredient: assetActions.onClickIngredient,
      onCopyPrompt: assetActions.onCopyPrompt,
      onDeleteIngredient: assetActions.onDeleteIngredient,
      onMarkRejected: assetActions.onMarkRejected,
      onMarkValidated: assetActions.onMarkValidated,
      onPublishIngredient: assetActions.onPublishIngredient,
      onRefresh: assetActions.onRefresh,
      onReprompt: () => onReprompt(job),
      onSeeDetails: assetActions.onSeeDetails,
      onToggleFavorite: assetActions.onToggleFavorite,
    };

    return (
      <article
        aria-label={`${label} generation`}
        className="group relative w-full overflow-visible rounded-lg"
        data-asset-media-state={mediaState}
        data-testid={`studio-asset-${job.id}`}
      >
        {job.type === 'image' ? (
          <LazyMasonryImage
            {...sharedProps}
            image={masonryIngredient as IImage}
            onConvertToVideo={assetActions.onConvertToVideo}
            onCreateVariation={assetActions.onCreateVariation}
            onMarkArchived={assetActions.onMarkArchived}
            onMediaError={handleMediaError}
            onUseAsVideoReference={assetActions.onUseAsVideoReference}
          />
        ) : (
          <LazyMasonryVideo
            {...sharedProps}
            video={masonryIngredient as IVideo}
          />
        )}

        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/90 via-black/35 to-transparent p-3 pr-24 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100"
          data-asset-details
        >
          <p className="line-clamp-2 text-xs text-white">{job.prompt}</p>
          <span className="mt-1 block truncate text-2xs text-white/70">
            {job.modelKey || 'Auto'}
          </span>
        </div>
      </article>
    );
  }

  return (
    <article
      aria-label={`${label} generation`}
      className="group relative w-full overflow-hidden rounded-lg bg-card shadow-border"
      data-asset-media-state={mediaState}
      data-testid={`studio-asset-${job.id}`}
      style={{ aspectRatio: `${width} / ${height}` }}
    >
      <div className="relative flex size-full min-h-40 items-center justify-center overflow-hidden bg-foreground/[0.04]">
        {isPending ? (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
            <span className="text-xs">{translate('generating')}</span>
          </div>
        ) : null}

        {isFailed || isPreviewUnavailable ? (
          <div className="flex flex-col items-center gap-2 px-3 text-center text-destructive">
            <AlertTriangle className="size-5" />
            <span className="text-xs">
              {isFailed
                ? job.error || translate('generationFailed')
                : translate('previewUnavailable')}
            </span>
          </div>
        ) : null}

        {mediaState === 'ready' && job.url ? (
          AUDIO_TYPES.has(job.type) ? (
            // biome-ignore lint/a11y/useMediaCaption: generated audio has no track
            <audio
              className="w-full px-3"
              controls
              onError={handleMediaError}
              src={job.url}
            />
          ) : VIDEO_TYPES.has(job.type) ? (
            // biome-ignore lint/a11y/useMediaCaption: generated video has no track
            <video
              className="size-full object-cover"
              controls
              onError={handleMediaError}
              src={job.url}
            />
          ) : (
            <NextImage
              alt={job.prompt}
              className="object-cover"
              fill
              onError={handleMediaError}
              sizes="(max-width: 768px) 50vw, 25vw"
              src={job.url}
              unoptimized
            />
          )
        ) : null}
      </div>

      <div
        className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between bg-gradient-to-t from-black/90 via-black/25 to-black/10 p-3 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100"
        data-asset-details
      >
        <Badge
          className="w-fit text-[0.625rem] uppercase tracking-wide"
          variant="secondary"
        >
          {label}
        </Badge>

        <div className="flex flex-col gap-2 text-white">
          <p className="line-clamp-3 text-xs text-white">{job.prompt}</p>
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[0.625rem] text-white/70">
              {job.modelKey || 'Auto'}
            </span>
            <div className="flex items-center gap-1">
              {isFailed ? (
                <Button
                  ariaLabel={translate('removeGenerationAria', {
                    prompt: job.prompt || job.id,
                    type: label,
                  })}
                  className="pointer-events-auto px-2 text-xs text-white hover:bg-white/15 hover:text-white"
                  icon={<Trash2 className="size-3.5" />}
                  label={translate('remove')}
                  onClick={() => assetActions.onRemoveGeneration(job)}
                  size={ButtonSize.SM}
                  variant={ButtonVariant.GHOST}
                  withWrapper={false}
                />
              ) : null}
              <Button
                ariaLabel={translate('repromptGenerationAria', {
                  prompt: job.prompt || job.id,
                  type: label,
                })}
                className="pointer-events-auto px-2 text-xs text-white hover:bg-white/15 hover:text-white"
                icon={<RotateCcw className="size-3.5" />}
                label={translate('reprompt')}
                onClick={() => onReprompt(job)}
                size={ButtonSize.SM}
                variant={ButtonVariant.GHOST}
                withWrapper={false}
              />
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
