'use client';

import { useGalleryModal } from '@genfeedai/contexts/providers/global-modals/global-modals.provider';
import {
  ButtonSize,
  ButtonVariant,
  IngredientCategory,
  IngredientFormat,
} from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { FrameSequenceSelectorProps } from '@genfeedai/props/studio/frame-sequence.props';
import Card from '@ui/card/Card';
import { Button } from '@ui/primitives/button';
import {
  ChevronLeft,
  ChevronRight,
  ImageIcon,
  Plus,
  Trash2,
} from 'lucide-react';
import Image from 'next/image';

const FORMAT_ASPECT_CLASSES: Record<IngredientFormat, string> = {
  [IngredientFormat.LANDSCAPE]: 'aspect-[16/9]',
  [IngredientFormat.SQUARE]: 'aspect-[1/1]',
  [IngredientFormat.PORTRAIT]: 'aspect-[9/16]',
};

const TILE_SIZE_CLASS = 'relative h-52 w-auto shrink-0 rounded-md';

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

        const seenIds = new Set<string>();
        const deduplicatedFrames = selected.filter((f) => {
          if (seenIds.has(f.id)) {
            return false;
          }
          seenIds.add(f.id);
          return true;
        });

        const uniqueNewFrames = deduplicatedFrames.filter(
          (f) => !existingIds.has(f.id),
        );
        if (uniqueNewFrames.length > 0) {
          onFramesChange([...frames, ...uniqueNewFrames]);
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

  const handleMoveFrame = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= frames.length) {
      return;
    }

    const nextFrames = [...frames];
    const [movedFrame] = nextFrames.splice(fromIndex, 1);
    nextFrames.splice(toIndex, 0, movedFrame);
    onFrameReorder?.(fromIndex, toIndex);
    onFramesChange(nextFrames);
  };

  const aspectClass =
    FORMAT_ASPECT_CLASSES[format] ??
    FORMAT_ASPECT_CLASSES[IngredientFormat.PORTRAIT];

  return (
    <Card
      label="Frame Sequence"
      icon={ImageIcon}
      className="overflow-visible"
      data-testid="frame-sequence-card"
      description="Select images in order. Each frame will be used as start and end frame for interpolation."
    >
      <div className="space-y-4">
        <div
          className="flex items-end gap-3 overflow-x-auto overflow-y-visible pb-1"
          data-testid="frame-sequence-strip"
        >
          {frames.map((frame, frameIndex) => (
            <div
              key={frame.id}
              className={cn(
                'group overflow-hidden bg-background',
                TILE_SIZE_CLASS,
                aspectClass,
              )}
            >
              <Image
                src={frame.ingredientUrl || ''}
                alt={`Frame ${frameIndex + 1}`}
                fill
                sizes="220px"
                className="object-cover"
              />
              <div className="absolute top-1 left-1 z-10 bg-primary px-1.5 py-0.5 text-xs font-semibold text-primary-foreground">
                {frameIndex + 1}
              </div>
              <div className="absolute inset-0 flex items-center justify-center gap-1.5 bg-background/80 opacity-0 transition-opacity group-hover:opacity-100">
                <Button
                  ariaLabel={`Move frame ${frameIndex + 1} earlier`}
                  label={<ChevronLeft />}
                  onClick={() => handleMoveFrame(frameIndex, frameIndex - 1)}
                  variant={ButtonVariant.SECONDARY}
                  size={ButtonSize.MICRO}
                  isDisabled={frameIndex === 0}
                  tooltip="Move earlier"
                />
                <Button
                  ariaLabel={`Move frame ${frameIndex + 1} later`}
                  label={<ChevronRight />}
                  onClick={() => handleMoveFrame(frameIndex, frameIndex + 1)}
                  variant={ButtonVariant.SECONDARY}
                  size={ButtonSize.MICRO}
                  isDisabled={frameIndex === frames.length - 1}
                  tooltip="Move later"
                />
                <Button
                  ariaLabel={`Remove frame ${frameIndex + 1}`}
                  label={<Trash2 />}
                  onClick={() => handleRemoveFrame(frameIndex)}
                  variant={ButtonVariant.DESTRUCTIVE}
                  size={ButtonSize.MICRO}
                />
              </div>
            </div>
          ))}

          <Button
            type="button"
            onClick={handleAddFrames}
            variant={ButtonVariant.UNSTYLED}
            withWrapper={false}
            className={cn(
              TILE_SIZE_CLASS,
              aspectClass,
              'flex flex-col items-center justify-center gap-2 border-2 border-dashed border-border bg-background hover:border-primary',
            )}
          >
            <Plus className="size-6 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Add Frame</span>
          </Button>
        </div>

        {frames.length > 0 ? (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{frames.length}</span>{' '}
            frame{frames.length !== 1 ? 's' : ''} selected.
            {frames.length >= 2 ? (
              <span className="ml-2">
                Pairs: {frames.length - 1} transition
                {frames.length - 1 !== 1 ? 's' : ''} (1-&gt;2, 2-&gt;3, ...)
              </span>
            ) : null}
          </p>
        ) : null}
      </div>
    </Card>
  );
}
