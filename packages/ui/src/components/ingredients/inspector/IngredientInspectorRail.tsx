'use client';

import { usePostModal } from '@genfeedai/contexts/providers/global-modals/global-modals.provider';
import {
  ButtonVariant,
  ComponentSize,
  IngredientCategory,
  IngredientLineageDirection,
  LIBRARY_SHELF_LABELS,
  LibraryShelf,
} from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { useAuthorizedMediaPreview } from '@genfeedai/hooks/media/use-authorized-media-preview';
import { useIngredientActions } from '@genfeedai/hooks/ui/ingredient/use-ingredient-actions/use-ingredient-actions';
import type { IngredientInspectorRailProps } from '@genfeedai/props/content/ingredient.props';
import { canOptimizeImageSource } from '@genfeedai/utils/media/image-optimization.util';
import {
  formatIngredientFileSize,
  getIngredientDimensionsLabel,
  getIngredientDurationLabel,
  getIngredientFailureReason,
  getIngredientFormatLabel,
  getIngredientModelLabel,
  getIngredientPromptText,
  getIngredientProviderLabel,
  getIngredientStyleLabel,
} from '@genfeedai/utils/media/ingredient-ledger.util';
import {
  getIngredientPreviewUrl,
  isRasterPreviewUrl,
} from '@genfeedai/utils/media/ingredient-preview.util';
import { isVideoIngredient } from '@genfeedai/utils/media/ingredient-type.util';
import Badge from '@ui/display/badge/Badge';
import VideoPlayer from '@ui/display/video-player/VideoPlayer';
import IngredientOriginBadge from '@ui/ingredients/ingredient-origin-badge';
import LibraryAssetTypeBadge from '@ui/ingredients/library-asset-type-badge';
import { Button } from '@ui/primitives/button';
import IngredientQuickActions from '@ui/quick-actions/actions/IngredientQuickActions';
import { format } from 'date-fns';
import { Maximize2 } from 'lucide-react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import IngredientLineageStrip from './IngredientLineageStrip';
import IngredientTagsControl from './IngredientTagsControl';
import { getIngredientShelf } from './ingredient-shelf.util';

const SHELF_VARIANTS: Record<
  LibraryShelf,
  'info' | 'warning' | 'success' | 'error' | 'slate'
> = {
  [LibraryShelf.GENERATING]: 'info',
  [LibraryShelf.UNSORTED]: 'slate',
  [LibraryShelf.NEEDS_REVIEW]: 'warning',
  [LibraryShelf.APPROVED]: 'success',
  [LibraryShelf.FAILED]: 'error',
  [LibraryShelf.ARCHIVED]: 'slate',
};

function InspectorField({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  if (!value) {
    return null;
  }

  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="shrink-0 text-2xs uppercase tracking-[0.12em] text-foreground/35">
        {label}
      </dt>
      <dd className="min-w-0 truncate text-right text-xs text-foreground/78">
        {value}
      </dd>
    </div>
  );
}

/**
 * The prompt and a failure reason are long enough to wrap, so each gets its
 * own block instead of a `<dl>` row. Its label travels as a prop like every
 * other label in this rail.
 */
function InspectorNote({
  label,
  text,
  tone = 'default',
}: {
  label: string;
  text?: string | null;
  tone?: 'default' | 'error';
}) {
  if (!text) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-2xs uppercase tracking-[0.12em] text-foreground/35">
        {label}
      </div>
      <p
        className={cn(
          'min-w-0 select-text whitespace-pre-wrap break-words text-xs leading-relaxed',
          tone === 'error' ? 'text-destructive' : 'text-foreground/62',
        )}
      >
        {text}
      </p>
    </div>
  );
}

/**
 * The inspector rail — what one asset is, read across all three Library axes at
 * once: its shelf (generation state), its folder (where a person filed it), and
 * its type. It appears only for a single selection; a multi-selection is a bulk
 * action, not something to inspect.
 */
export default function IngredientInspectorRail({
  className,
  ingredient,
  onOpenPreview,
}: IngredientInspectorRailProps) {
  const translate = useTranslations('pages.library.inspector');
  const shelf = getIngredientShelf(ingredient);
  const grant = useAuthorizedMediaPreview(ingredient);
  // The rail is a full detail surface, so Publish and Download run the same
  // handlers as the asset modal. Without them the quick actions render as
  // locked placeholders.
  const { openPostBatchModal } = usePostModal();
  const { handlers, loadingStates } = useIngredientActions({
    onPublishIngredient: openPostBatchModal,
  });
  const previewUrl = grant
    ? isRasterPreviewUrl(grant.url)
      ? grant.url
      : ''
    : getIngredientPreviewUrl(ingredient);
  const videoUrl = isVideoIngredient(ingredient)
    ? grant
      ? (grant.url ?? undefined)
      : ingredient.ingredientUrl
    : undefined;
  const fileSize = formatIngredientFileSize(
    ingredient.fileSize || ingredient.metadataSize,
  );

  return (
    <aside
      aria-label="Asset details"
      className={cn(
        'flex min-w-0 flex-col gap-4 overflow-y-auto px-4 py-4 scrollbar-thin',
        className,
      )}
    >
      {previewUrl || videoUrl ? (
        <div className="relative h-[clamp(12rem,35dvh,24rem)] w-full shrink-0 overflow-hidden rounded-lg bg-foreground/4">
          {videoUrl ? (
            <VideoPlayer
              key={ingredient.id}
              src={videoUrl}
              thumbnail={ingredient.thumbnailUrl}
            />
          ) : previewUrl ? (
            <Image
              alt={ingredient.metadataLabel || translate('untitled')}
              className="object-contain outline-media"
              fill
              sizes="(min-width: 1024px) 480px, 90vw"
              src={previewUrl}
              unoptimized={
                ingredient.category === IngredientCategory.GIF ||
                !canOptimizeImageSource(previewUrl)
              }
            />
          ) : null}
          {onOpenPreview ? (
            <Button
              ariaLabel={translate('openPreview')}
              className={cn(
                'absolute z-10 flex items-center justify-center',
                // A video keeps its own controls, so only its corner opens
                // the lightbox; an image is one big hit target.
                videoUrl
                  ? 'right-2 top-2 size-7 rounded-full bg-background/80 text-foreground backdrop-blur hover:bg-background'
                  : 'inset-0 cursor-zoom-in',
              )}
              onClick={onOpenPreview}
              type="button"
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
            >
              {videoUrl ? <Maximize2 className="size-3.5" /> : null}
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <h3 className="truncate text-sm font-semibold text-foreground">
          {ingredient.metadataLabel || translate('untitled')}
        </h3>
        {shelf ? (
          <Badge
            className="w-fit"
            size={ComponentSize.SM}
            variant={SHELF_VARIANTS[shelf]}
          >
            {LIBRARY_SHELF_LABELS[shelf]}
          </Badge>
        ) : null}
      </div>

      <dl className="flex flex-col divide-y divide-foreground/6">
        <div className="flex items-baseline justify-between gap-3 py-1.5">
          <dt className="shrink-0 text-2xs uppercase tracking-[0.12em] text-foreground/35">
            {translate('type')}
          </dt>
          <dd className="min-w-0">
            <LibraryAssetTypeBadge category={ingredient.category} />
          </dd>
        </div>
        {ingredient.origin ? (
          <div className="flex items-baseline justify-between gap-3 py-1.5">
            <dt className="shrink-0 text-2xs uppercase tracking-[0.12em] text-foreground/35">
              {translate('origin')}
            </dt>
            <dd className="min-w-0">
              <IngredientOriginBadge origin={ingredient.origin} />
            </dd>
          </div>
        ) : null}
        <InspectorField
          label={translate('model')}
          value={getIngredientModelLabel(ingredient)}
        />
        <InspectorField
          label={translate('provider')}
          value={getIngredientProviderLabel(ingredient)}
        />
        <InspectorField
          label={translate('style')}
          value={getIngredientStyleLabel(ingredient)}
        />
        <InspectorField
          label={translate('dimensions')}
          value={getIngredientDimensionsLabel(ingredient)}
        />
        <InspectorField
          label={translate('duration')}
          value={getIngredientDurationLabel(ingredient)}
        />
        <InspectorField
          label={translate('format')}
          value={getIngredientFormatLabel(ingredient)}
        />
        <InspectorField label={translate('file')} value={fileSize} />
        <InspectorField
          label={translate('created')}
          value={
            ingredient.createdAt
              ? format(new Date(ingredient.createdAt), 'd MMM yyyy, HH:mm')
              : null
          }
        />
      </dl>

      <InspectorNote
        label={translate('failureReason')}
        text={getIngredientFailureReason(ingredient)}
        tone="error"
      />
      <InspectorNote
        label={translate('prompt')}
        text={getIngredientPromptText(ingredient)}
      />

      <IngredientTagsControl ingredient={ingredient} />

      <IngredientLineageStrip
        direction={IngredientLineageDirection.MADE_FROM}
        ingredientId={ingredient.id}
      />
      <IngredientLineageStrip
        direction={IngredientLineageDirection.USED_IN}
        ingredientId={ingredient.id}
      />

      <IngredientQuickActions
        align="start"
        isDownloading={loadingStates.isDownloading}
        isPublishing={loadingStates.isPublishing}
        onDownload={async (asset) => {
          await handlers.handleDownload(asset);
          return undefined;
        }}
        onPublish={handlers.handlePublish}
        selectedIngredient={ingredient}
      />
    </aside>
  );
}
