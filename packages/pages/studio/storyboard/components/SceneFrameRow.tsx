'use client';

import { ButtonSize, ButtonVariant, ComponentSize } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { StoryboardSceneRowProps } from '@genfeedai/props/studio/storyboard.props';
import Spinner from '@ui/feedback/spinner/Spinner';
import { Button } from '@ui/primitives/button';
import { Textarea } from '@ui/primitives/textarea';
import { CircleCheck, CircleX, RotateCcw, Trash2 } from 'lucide-react';
import Image from 'next/image';

const STATUS_LABELS: Record<string, string> = {
  completed: 'Completed',
  failed: 'Failed',
  generating: 'Generating',
  pending: 'Ready',
};

export default function SceneFrameRow({
  frame,
  isBusy,
  onChange,
  onRemove,
  onRetry,
}: StoryboardSceneRowProps) {
  const thumb =
    frame.videoThumbnailUrl || frame.imageThumbnailUrl || frame.imageUrl;
  const status = frame.status ?? 'pending';
  const isGenerating = status === 'generating';
  const isFailed = status === 'failed';
  const isCompleted = status === 'completed';

  return (
    // A row inside the "Scenes" Card, not a card of its own — it carries no
    // surface token because the parent Card already paints `bg-card`.
    <div
      className={cn(
        'flex flex-col gap-2 rounded-md border border-border p-3 sm:flex-row sm:items-start',
        isFailed && 'border-error/40',
        isGenerating && 'border-primary/40',
      )}
    >
      <div className="relative size-20 shrink-0 overflow-hidden rounded-md bg-background-secondary">
        {thumb ? (
          <Image
            src={thumb}
            alt={`Scene ${frame.order + 1}`}
            fill
            className="object-cover"
            sizes="80px"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
            No image
          </div>
        )}
        {isGenerating ? (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60">
            <Spinner size={ComponentSize.SM} />
          </div>
        ) : null}
      </div>

      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-foreground">
            Scene {frame.order + 1}
          </span>
          <span
            className={cn(
              'flex items-center gap-1 text-2xs uppercase tracking-wide text-muted-foreground',
              isFailed && 'text-error',
              isCompleted && 'text-success',
              isGenerating && 'text-primary',
            )}
          >
            {isCompleted ? <CircleCheck className="size-3" /> : null}
            {isFailed ? <CircleX className="size-3" /> : null}
            {STATUS_LABELS[status] ?? status}
          </span>
        </div>

        <Textarea
          value={frame.prompt ?? ''}
          onChange={(event) =>
            onChange(frame.id, { prompt: event.target.value })
          }
          placeholder="Script / prompt for this frame (what should happen in the clip)"
          className="min-h-20 text-sm"
          isDisabled={isBusy}
        />

        {isFailed && frame.error ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-xs text-error">
              {frame.error}
            </span>
            <Button
              size={ButtonSize.SM}
              variant={ButtonVariant.SECONDARY}
              icon={<RotateCcw className="size-3.5" />}
              label="Retry"
              onClick={() => onRetry(frame.id)}
              isDisabled={isBusy}
            />
          </div>
        ) : null}
      </div>

      <Button
        variant={ButtonVariant.GHOST}
        size={ButtonSize.ICON}
        ariaLabel={`Remove scene ${frame.order + 1}`}
        onClick={() => onRemove(frame.id)}
        isDisabled={isBusy}
        icon={<Trash2 className="size-3.5" />}
      />
    </div>
  );
}
