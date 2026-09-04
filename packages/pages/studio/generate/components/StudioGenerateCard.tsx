'use client';

import {
  ButtonSize,
  ButtonVariant,
  IngredientStatus,
  ViewType,
} from '@genfeedai/contracts';
import type {
  IImage,
  IMetadata,
  IVideo,
} from '@genfeedai/contracts/interfaces';
import { Image as IngredientImage } from '@genfeedai/models/ingredients/image.model';
import { Video } from '@genfeedai/models/ingredients/video.model';
import type { StudioGenerateCardProps } from '@genfeedai/props/studio/studio-generate.props';
import { getStudioGenerateTypeConfig } from '@pages/studio/generate/utils/studio-generate-types';
import AssetHoverDetails from '@ui/ingredients/asset-hover-details';
import {
  LazyMasonryImage,
  LazyMasonryVideo,
} from '@ui/lazy/masonry/LazyMasonry';
import { Badge } from '@ui/primitives/badge';
import { Button } from '@ui/primitives/button';
import {
  AlertTriangle,
  ImageOff,
  Loader2,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import NextImage from 'next/image';
import { useTranslations } from 'next-intl';
import {
  type MouseEvent,
  type ReactElement,
  useCallback,
  useMemo,
  useState,
} from 'react';

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
  isSelected = false,
  job,
  onReprompt,
  onSelect,
  view,
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
  const isListView = view === ViewType.LIST;

  const handleMediaError = useCallback(() => {
    if (job.url) {
      setFailedMediaUrl(job.url);
    }
  }, [job.url]);

  const handleCardActivate = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      if (event.target instanceof Element && event.target.closest('button')) {
        return;
      }
      onSelect(job);
    },
    [job, onSelect],
  );

  function renderDetails(showLifecycleActions = false): ReactElement {
    return (
      <div
        className={`flex min-w-0 flex-col gap-3 bg-card p-3 ${
          isListView ? 'justify-center sm:p-4' : 'border-t border-border'
        }`}
        data-asset-details
      >
        <div className="flex min-w-0 items-center justify-between gap-2">
          <Badge
            className="w-fit shrink-0 text-2xs uppercase tracking-wide"
            variant="secondary"
          >
            {label}
          </Badge>
          <span className="truncate text-2xs text-muted-foreground">
            {job.modelKey || 'Auto'}
          </span>
        </div>

        <p
          className={`break-words text-sm leading-relaxed text-foreground ${
            isListView ? '' : 'line-clamp-2'
          }`}
        >
          {job.prompt}
        </p>

        {showLifecycleActions ? (
          <div className="flex items-center gap-1 border-t border-border pt-2">
            {isFailed ? (
              <Button
                ariaLabel={translate('removeGenerationAria', {
                  prompt: job.prompt || job.id,
                  type: label,
                })}
                className="px-2 text-xs"
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
              className="px-2 text-xs"
              icon={<RotateCcw className="size-3.5" />}
              label={translate('reprompt')}
              onClick={() => onReprompt(job)}
              size={ButtonSize.SM}
              variant={ButtonVariant.GHOST}
              withWrapper={false}
            />
          </div>
        ) : null}
      </div>
    );
  }

  function renderHoverDetails(showLifecycleActions = false): ReactElement {
    return (
      <AssetHoverDetails
        actions={
          showLifecycleActions ? (
            <>
              {isFailed ? (
                <Button
                  ariaLabel={translate('removeGenerationAria', {
                    prompt: job.prompt || job.id,
                    type: label,
                  })}
                  className="h-auto px-2 text-xs text-foreground/75 hover:text-foreground"
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
                className="h-auto px-2 text-xs text-foreground/75 hover:text-foreground"
                icon={<RotateCcw className="size-3.5" />}
                label={translate('reprompt')}
                onClick={() => onReprompt(job)}
                size={ButtonSize.SM}
                variant={ButtonVariant.GHOST}
                withWrapper={false}
              />
            </>
          ) : undefined
        }
        label={job.prompt}
        metadata={job.modelKey || 'Auto'}
        typeLabel={label}
      />
    );
  }

  if (mediaState === 'ready' && masonryIngredient) {
    const sharedProps = {
      isActionsEnabled: true,
      isContainerHovered: true,
      isDragEnabled: false,
      onClickIngredient: () => onSelect(job),
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
        className={`group relative w-full cursor-pointer rounded-lg border border-border bg-card shadow-border transition-[border-color,box-shadow] duration-200 hover:border-border-strong hover:shadow-border-strong ${
          isListView
            ? 'grid min-h-32 grid-cols-[7rem_minmax(0,1fr)] overflow-hidden sm:min-h-40 sm:grid-cols-[12rem_minmax(0,1fr)]'
            : 'overflow-hidden'
        } ${isSelected ? 'ring-2 ring-primary' : ''}`}
        data-asset-media-state={mediaState}
        data-selected={isSelected ? 'true' : 'false'}
        data-testid={`studio-asset-${job.id}`}
        onClick={handleCardActivate}
      >
        <div
          className={
            isListView
              ? 'relative h-32 overflow-hidden border-r border-border sm:h-40'
              : 'relative min-w-0 overflow-hidden'
          }
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
        </div>

        {isListView ? renderDetails() : renderHoverDetails()}
      </article>
    );
  }

  return (
    <article
      aria-label={`${label} generation`}
      className={`group relative w-full cursor-pointer overflow-hidden rounded-lg border border-border bg-card shadow-border transition-[border-color,box-shadow] duration-200 hover:border-border-strong hover:shadow-border-strong ${
        isListView
          ? 'grid min-h-32 grid-cols-[7rem_minmax(0,1fr)] sm:min-h-40 sm:grid-cols-[12rem_minmax(0,1fr)]'
          : ''
      } ${isSelected ? 'ring-2 ring-primary' : ''}`}
      data-asset-media-state={mediaState}
      data-selected={isSelected ? 'true' : 'false'}
      data-testid={`studio-asset-${job.id}`}
      onClick={handleCardActivate}
    >
      <div
        className={`pointer-events-none relative z-0 flex items-center justify-center overflow-hidden bg-foreground/[0.04] ${
          isListView ? 'h-32 border-r border-border sm:h-40' : 'w-full min-h-40'
        }`}
        style={isListView ? undefined : { aspectRatio: `${width} / ${height}` }}
      >
        {isPending ? (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
            <span className="text-xs">{translate('generating')}</span>
          </div>
        ) : null}

        {isFailed || isPreviewUnavailable ? (
          <div
            className={`flex flex-col items-center gap-2 px-3 text-center ${
              isFailed ? 'text-destructive' : 'text-muted-foreground'
            }`}
          >
            {isFailed ? (
              <AlertTriangle className="size-5" />
            ) : (
              <ImageOff className="size-5" />
            )}
            <span className="text-xs">
              {isFailed
                ? job.error || translate('generationFailed')
                : translate('previewUnavailable')}
            </span>
            {isPreviewUnavailable ? (
              <span className="max-w-48 text-2xs leading-relaxed text-muted-foreground/75">
                {translate('previewUnavailableDescription')}
              </span>
            ) : null}
          </div>
        ) : null}

        {mediaState === 'ready' && job.url ? (
          AUDIO_TYPES.has(job.type) ? (
            // biome-ignore lint/a11y/useMediaCaption: generated audio has no track
            <audio
              className="pointer-events-auto w-full px-3"
              controls
              onError={handleMediaError}
              src={job.url}
            />
          ) : VIDEO_TYPES.has(job.type) ? (
            // biome-ignore lint/a11y/useMediaCaption: generated video has no track
            <video
              className="pointer-events-auto size-full object-cover"
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

      {isListView ? renderDetails(true) : renderHoverDetails(true)}
    </article>
  );
}
