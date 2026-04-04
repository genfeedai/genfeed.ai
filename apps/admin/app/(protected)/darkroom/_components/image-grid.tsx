'use client';

import type { IDarkroomAsset } from '@genfeedai/interfaces';
import { ButtonSize, ButtonVariant } from '@genfeedai/enums';
import Button from '@ui/buttons/base/Button';
import Card from '@ui/card/Card';
import { Checkbox } from '@ui/primitives/checkbox';
import { useCallback, useMemo, useState } from 'react';
import {
  HiChevronLeft,
  HiChevronRight,
  HiOutlineTrash,
  HiXMark,
} from 'react-icons/hi2';

interface ImageGridProps {
  images: IDarkroomAsset[];
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  onDelete?: (ids: string[]) => void;
  onMove?: (ids: string[], target: string) => void;
  moveLabel?: string;
  pageSize?: number;
  isLoading?: boolean;
}

const DEFAULT_PAGE_SIZE = 24;

export default function ImageGrid({
  images,
  selectedIds,
  onSelectionChange,
  onDelete,
  onMove,
  moveLabel = 'Move',
  pageSize = DEFAULT_PAGE_SIZE,
  isLoading = false,
}: ImageGridProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [lightboxAsset, setLightboxAsset] = useState<IDarkroomAsset | null>(
    null,
  );

  const totalPages = Math.max(1, Math.ceil(images.length / pageSize));
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, images.length);

  const paginatedImages = useMemo(
    () => images.slice(startIndex, endIndex),
    [images, startIndex, endIndex],
  );

  const allCurrentSelected = useMemo(
    () =>
      paginatedImages.length > 0 &&
      paginatedImages.every((img) => selectedIds.has(img.id)),
    [paginatedImages, selectedIds],
  );

  const handleToggleAll = useCallback(() => {
    const next = new Set(selectedIds);

    if (allCurrentSelected) {
      for (const img of paginatedImages) {
        next.delete(img.id);
      }
    } else {
      for (const img of paginatedImages) {
        next.add(img.id);
      }
    }

    onSelectionChange(next);
  }, [allCurrentSelected, paginatedImages, selectedIds, onSelectionChange]);

  const handleToggle = useCallback(
    (id: string) => {
      const next = new Set(selectedIds);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      onSelectionChange(next);
    },
    [selectedIds, onSelectionChange],
  );

  const handleClearSelection = useCallback(() => {
    onSelectionChange(new Set());
  }, [onSelectionChange]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: pageSize > 8 ? 8 : pageSize }).map((_, i) => (
          <div
            key={i}
            className="aspect-square rounded-lg bg-foreground/5 animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-foreground/50">
        No images found
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <Card>
          <div className="flex items-center gap-4 px-4 py-3">
            <span className="text-sm font-medium">
              {selectedIds.size} selected
            </span>

            <div className="flex items-center gap-2 ml-auto">
              {onMove && (
                <Button
                  variant={ButtonVariant.UNSTYLED}
                  withWrapper={false}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                  onClick={() => onMove(Array.from(selectedIds), 'approved')}
                >
                  {moveLabel}
                </Button>
              )}

              {onDelete && (
                <Button
                  variant={ButtonVariant.UNSTYLED}
                  withWrapper={false}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded bg-error/10 text-error hover:bg-error/20 transition-colors"
                  onClick={() => onDelete(Array.from(selectedIds))}
                >
                  <HiOutlineTrash className="w-4 h-4" />
                  Delete
                </Button>
              )}

              <Button
                variant={ButtonVariant.GHOST}
                className="flex items-center gap-1 px-2 py-1.5 text-sm text-foreground/60 hover:text-foreground"
                onClick={handleClearSelection}
              >
                <HiXMark className="w-4 h-4" />
                Clear
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Select All + Info Row */}
      <div className="flex items-center justify-between px-1">
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <Checkbox
            checked={allCurrentSelected}
            onCheckedChange={() => handleToggleAll()}
            aria-label="Select all images on the current page"
          />
          Select all on page
        </label>

        <span className="text-sm text-foreground/50">
          Showing {startIndex + 1}-{endIndex} of {images.length}
        </span>
      </div>

      {/* Image Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {paginatedImages.map((asset) => (
          <div key={asset.id} className="relative group">
            <Button
              variant={ButtonVariant.UNSTYLED}
              withWrapper={false}
              className="w-full aspect-square rounded-lg overflow-hidden bg-foreground/5 cursor-pointer border-2 transition-colors"
              onClick={() => setLightboxAsset(asset)}
              style={{
                borderColor: selectedIds.has(asset.id)
                  ? 'var(--color-primary)'
                  : 'transparent',
              }}
            >
              <img
                alt={asset.label || 'Darkroom asset'}
                className="w-full h-full object-cover"
                loading="lazy"
                src={asset.url}
              />
            </Button>

            {/* Selection checkbox overlay */}
            <div className="absolute top-2 left-2">
              <Checkbox
                checked={selectedIds.has(asset.id)}
                className="h-5 w-5 border-white/60 bg-black/30"
                onCheckedChange={() => handleToggle(asset.id)}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 pt-2">
          <Button
            variant={ButtonVariant.GHOST}
            size={ButtonSize.ICON}
            isDisabled={currentPage <= 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
          >
            <HiChevronLeft className="w-5 h-5" />
          </Button>

          <span className="text-sm text-foreground/70">
            Page {currentPage} of {totalPages}
          </span>

          <Button
            variant={ButtonVariant.GHOST}
            size={ButtonSize.ICON}
            isDisabled={currentPage >= totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
          >
            <HiChevronRight className="w-5 h-5" />
          </Button>
        </div>
      )}

      {/* Lightbox Modal */}
      {lightboxAsset && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setLightboxAsset(null)}
          role="dialog"
        >
          <Button
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
            className="absolute top-4 right-4 p-2 text-white/80 hover:text-white transition-colors"
            onClick={() => setLightboxAsset(null)}
          >
            <HiXMark className="w-8 h-8" />
          </Button>

          <img
            alt={lightboxAsset.label || 'Darkroom asset'}
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
            src={lightboxAsset.url}
          />
        </div>
      )}
    </div>
  );
}
