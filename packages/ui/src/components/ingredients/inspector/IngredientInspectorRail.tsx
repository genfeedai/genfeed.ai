'use client';

import {
  ComponentSize,
  LIBRARY_SHELF_LABELS,
  LibraryShelf,
} from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { IngredientInspectorRailProps } from '@genfeedai/props/content/ingredient.props';
import { getIngredientPreviewUrl } from '@genfeedai/utils/media/ingredient-preview.util';
import Badge from '@ui/display/badge/Badge';
import LibraryAssetTypeBadge from '@ui/ingredients/library-asset-type-badge';
import { format } from 'date-fns';
import Image from 'next/image';
import { useTranslations } from 'next-intl';

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

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB'] as const;

function formatBytes(bytes?: number): string | null {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) {
    return null;
  }

  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${unitIndex === 0 ? Math.round(value) : value.toFixed(1)} ${BYTE_UNITS[unitIndex]}`;
}

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
 * The prompt is the one field long enough to wrap, so it gets its own block
 * instead of a `<dl>` row. Its label travels as a prop like every other label
 * in this rail.
 */
function InspectorNote({
  label,
  text,
}: {
  label: string;
  text?: string | null;
}) {
  if (!text) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-2xs uppercase tracking-[0.12em] text-foreground/35">
        {label}
      </div>
      <p className="line-clamp-6 text-xs leading-relaxed text-foreground/62">
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
}: IngredientInspectorRailProps) {
  const translate = useTranslations('pages.library.inspector');
  const shelf = getIngredientShelf(ingredient);
  const previewUrl = getIngredientPreviewUrl(ingredient);
  const dimensions =
    ingredient.width && ingredient.height
      ? `${ingredient.width} × ${ingredient.height}`
      : null;

  return (
    <aside
      aria-label="Asset details"
      className={cn(
        'flex min-w-0 flex-col gap-4 overflow-y-auto px-4 py-4 scrollbar-thin',
        className,
      )}
    >
      {previewUrl ? (
        <div className="relative aspect-[4/5] w-full overflow-hidden rounded-lg bg-foreground/4">
          <Image
            alt={ingredient.metadataLabel || translate('untitled')}
            className="object-cover outline-media"
            fill
            sizes="(min-width: 1024px) 288px, 90vw"
            src={previewUrl}
          />
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
        <InspectorField label="Size" value={dimensions} />
        <InspectorField
          label="File"
          value={formatBytes(ingredient.metadataSize)}
        />
        <InspectorField
          label="Model"
          value={ingredient.metadataModelLabel || ingredient.model}
        />
        <InspectorField label="Provider" value={ingredient.provider} />
        <InspectorField
          label="Created"
          value={
            ingredient.createdAt
              ? format(new Date(ingredient.createdAt), 'd MMM yyyy, HH:mm')
              : null
          }
        />
      </dl>

      <InspectorNote label="Prompt" text={ingredient.promptText} />
    </aside>
  );
}
