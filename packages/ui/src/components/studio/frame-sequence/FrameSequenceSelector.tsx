'use client';

import { useGalleryModal } from '@genfeedai/contexts/providers/global-modals/global-modals.provider';
import {
  ButtonSize,
  ButtonVariant,
  IngredientCategory,
  IngredientFormat,
} from '@genfeedai/enums';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { IImage } from '@genfeedai/interfaces';
import type { FrameSequenceSelectorProps } from '@genfeedai/props/studio/frame-sequence.props';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import Image from 'next/image';
import { HiPhoto, HiPlus, HiTrash } from 'react-icons/hi2';

const FORMAT_ASPECT_CLASSES: Record<IngredientFormat, string> = {
  [IngredientFormat.LANDSCAPE]: 'aspect-[16/9]',
  [IngredientFormat.SQUARE]: 'aspect-[1/1]',
  [IngredientFormat.PORTRAIT]: 'aspect-[9/16]',
};

const FORMAT_GRID_CLASSES: Record<IngredientFormat, string> = {
  [IngredientFormat.LANDSCAPE]: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4',
  [IngredientFormat.SQUARE]: 'grid-cols-3 sm:grid-cols-4 md:grid-cols-5',
  [IngredientFormat.PORTRAIT]:
    'grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6',
};

export default function FrameSequenceSelector({
  frames,
  format,
  onFramesChange,
  onFrameReorder,
}: FrameSequenceSelectorProps) {
  const { openGallery } = useGalleryModal();

  const handleAddFrames = () => {
    openGallery({
      category: IngredientCategory.IMAGE,
      format: format,
      maxSelectableItems: 50,
      onSelect: (selected) => {
        const existingIds = new Set(frames.map((f) => f.id));
        const rawFrames = Array.isArray(selected)
          ? selected
          : selected
            ? [selected]
            : [];

        // Deduplicate within the selected array itself (gallery may return duplicates)
        const seenIds = new Set<string>();
        const deduplicatedFrames = rawFrames.filter((f) => {
          if (seenIds.has(f.id)) {
            return false;
          }
          seenIds.add(f.id);
          return true;
        });

        // Filter out frames already in the list
        const uniqueNewFrames = deduplicatedFrames.filter(
          (f) => !existingIds.has(f.id),
        );
        if (uniqueNewFrames.length > 0) {
          onFramesChange([
            ...frames,
            ...(uniqueNewFrames as unknown as IImage[]),
          ]);
        }
      },
      selectedReferences: frames.map((f) => f.id),
      title: 'Select Frames for Sequence',
    });
  };

  const handleRemoveFrame = (index: number) => {
    const newFrames = frames.filter((_, i) => i !== index);
    onFramesChange(newFrames);
  };

  const aspectClass =
    FORMAT_ASPECT_CLASSES[format] ??
    FORMAT_ASPECT_CLASSES[IngredientFormat.PORTRAIT];
  const gridClass =
    FORMAT_GRID_CLASSES[format] ??
    FORMAT_GRID_CLASSES[IngredientFormat.PORTRAIT];

  return (
    <Card
      label="Frame Sequence"
      icon={HiPhoto}
      description="Select images in order. Each frame will be used as start and end frame for interpolation."
    >
      <div className="space-y-4">
        {/* Frame Grid */}
        <div className={cn('grid gap-3', gridClass)}>
          {frames.map((frame, index) => (
            <div
              key={`${frame.id}-${index}`}
              className="group relative bg-background overflow-hidden"
            >
              <div className={cn(aspectClass, 'relative')}>
                <Image
                  src={frame.ingredientUrl || ''}
                  alt={`Frame ${index + 1}`}
                  fill
                  className="object-cover"
                />
                {/* Frame Number Badge */}
                <div className="absolute top-1 left-1 bg-primary text-primary-foreground px-1.5 py-0.5 text-xs font-semibold z-10">
                  {index + 1}
                </div>
                {/* Remove Button */}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Button
                    label={<HiTrash />}
                    onClick={() => handleRemoveFrame(index)}
                    variant={ButtonVariant.DESTRUCTIVE}
                    size={ButtonSize.XS}
                  />
                </div>
              </div>
            </div>
          ))}

          {/* Add Frame Button */}
          <Button
            type="button"
            onClick={handleAddFrames}
            variant={ButtonVariant.UNSTYLED}
            className={cn(
              aspectClass,
              'bg-background border-2 border-dashed border-white/[0.08] flex flex-col items-center justify-center gap-2 hover:border-primary transition-colors cursor-pointer',
            )}
          >
            <HiPlus className="text-2xl text-foreground/40" />
            <span className="text-xs text-foreground/60">Add Frame</span>
          </Button>
        </div>

        {/* Sequence Info */}
        {frames.length > 0 && (
          <div className="bg-background/50 p-3 text-sm">
            <p className="text-foreground/70">
              <strong>{frames.length}</strong> frame
              {frames.length !== 1 ? 's' : ''} selected.
              {frames.length >= 2 && (
                <span className="ml-2">
                  Pairs: {frames.length - 1} transition
                  {frames.length - 1 !== 1 ? 's' : ''} (1→2, 2→3, ...)
                </span>
              )}
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
