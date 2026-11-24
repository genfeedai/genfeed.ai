'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type {
  LibraryGridItem,
  LibraryGridProps,
} from '@genfeedai/props/ui/content/library-picker.props';
import OrderedMasonry from '@ui/display/masonry/OrderedMasonry';
import { Button } from '@ui/primitives/button';
import { SELECTED_CARD_CLASS } from '@ui/styles/selected-card';
import { Check, FileText, ImageIcon, Play } from 'lucide-react';
import Image from 'next/image';
import type { ReactElement } from 'react';

const TILE_MIN_WIDTH = 150;
const TILE_GAP = 8;

function isVideoKind(kind: string): boolean {
  return kind.toLowerCase().includes('video');
}

function kindIcon(kind: string): ReactElement {
  const normalized = kind.toLowerCase();
  const isVisual =
    normalized.includes('image') ||
    normalized.includes('photo') ||
    normalized.includes('visual') ||
    normalized.includes('video') ||
    normalized.includes('gif');

  return isVisual ? (
    <ImageIcon aria-hidden="true" className="size-5" />
  ) : (
    <FileText aria-hidden="true" className="size-5" />
  );
}

function LibraryTile({
  ariaLabel,
  isLocked,
  isPressable,
  isSelected,
  item,
  renderPreview,
  onSelect,
}: {
  ariaLabel: string;
  isLocked: boolean;
  /** A pressed state is exposed only when the caller tracks selection. */
  isPressable: boolean;
  isSelected: boolean;
  item: LibraryGridItem;
  renderPreview?: LibraryGridProps['renderPreview'];
  onSelect: (item: LibraryGridItem) => void;
}): ReactElement {
  return (
    <Button
      ariaLabel={ariaLabel}
      aria-pressed={isPressable ? isSelected : undefined}
      className={cn(
        'group flex w-full flex-col overflow-hidden rounded-card bg-card text-left shadow-border transition-colors',
        isSelected ? SELECTED_CARD_CLASS : 'hover:bg-foreground/5',
        isLocked && 'opacity-60',
      )}
      data-motion={isSelected ? 'allow' : undefined}
      isDisabled={isLocked}
      onClick={() => onSelect(item)}
      variant={ButtonVariant.UNSTYLED}
      withWrapper={false}
    >
      <div
        className="relative w-full overflow-hidden bg-background"
        style={{ aspectRatio: item.aspectRatio ?? 1 }}
      >
        {renderPreview?.(item) ??
          (item.thumbnailUrl ? (
            <Image
              alt=""
              className="object-cover"
              fill
              sizes="160px"
              src={item.thumbnailUrl}
              unoptimized
            />
          ) : (
            <div className="flex size-full items-center justify-center text-muted-foreground">
              {kindIcon(item.kind)}
            </div>
          ))}
        {isVideoKind(item.kind) ? (
          <span className="pointer-events-none absolute right-2 bottom-2 flex size-6 items-center justify-center rounded-full bg-background/90 text-foreground shadow-border">
            <Play aria-hidden="true" className="size-3.5 fill-current" />
          </span>
        ) : null}
        {isSelected ? (
          <span className="absolute top-2 left-2 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-border">
            <Check aria-hidden="true" className="size-3.5" strokeWidth={3} />
          </span>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-col gap-0.5 px-2 py-1.5">
        <span className="truncate text-xs font-medium text-foreground/90">
          {item.title}
        </span>
        <span className="truncate text-2xs uppercase tracking-label text-muted-foreground">
          {item.kind}
        </span>
      </div>
    </Button>
  );
}

/**
 * The Library masonry for every picker: the same tile, the same selection
 * look and the same column packing wherever someone chooses an asset. A
 * picker never lays media out with its own grid.
 */
export default function LibraryGrid({
  ariaLabel,
  getItemAriaLabel,
  isSelectedLocked = false,
  items,
  maxColumns = 3,
  renderPreview,
  selectedIds,
  onSelect,
}: LibraryGridProps): ReactElement {
  return (
    <div aria-label={ariaLabel} role="group">
      <OrderedMasonry
        gap={TILE_GAP}
        maxColumns={maxColumns}
        minColumnWidth={TILE_MIN_WIDTH}
      >
        {items.map((item) => {
          const isSelected = selectedIds?.has(item.id) ?? false;

          return (
            <LibraryTile
              ariaLabel={getItemAriaLabel?.(item) ?? item.title}
              isLocked={isSelected && isSelectedLocked}
              isPressable={selectedIds !== undefined}
              isSelected={isSelected}
              item={item}
              key={item.id}
              onSelect={onSelect}
              renderPreview={renderPreview}
            />
          );
        })}
      </OrderedMasonry>
    </div>
  );
}
