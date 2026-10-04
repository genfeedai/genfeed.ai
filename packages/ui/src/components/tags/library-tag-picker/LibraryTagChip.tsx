'use client';

import { ButtonVariant } from '@genfeedai/contracts';
import type { ITag } from '@genfeedai/contracts/interfaces';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import { X } from 'lucide-react';
import { resolveLibraryTagColors } from './library-tag-colors.util';

export interface LibraryTagChipProps {
  className?: string;
  /** Shown as a remove button when set; keyboard operable. */
  onRemove?: (tag: LibraryTagChipProps['tag']) => void;
  /** Accessible name of the remove button, translated by the caller. */
  removeLabel?: string;
  tag: Pick<ITag, 'backgroundColor' | 'id' | 'label' | 'textColor'>;
}

/**
 * A tag as a pill. The label is always text, and a color a member picked is
 * only used while it keeps AA contrast against its background.
 */
export default function LibraryTagChip({
  className,
  onRemove,
  removeLabel,
  tag,
}: LibraryTagChipProps) {
  const colors = resolveLibraryTagColors(tag);

  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        colors ? null : 'bg-foreground/10 text-foreground',
        onRemove ? 'pr-1' : null,
        className,
      )}
      style={
        colors
          ? { backgroundColor: colors.backgroundColor, color: colors.textColor }
          : undefined
      }
      title={tag.label}
    >
      <span className="truncate">{tag.label}</span>
      {onRemove ? (
        <Button
          ariaLabel={removeLabel}
          className="flex size-4 shrink-0 items-center justify-center rounded-full hover:bg-foreground/15"
          icon={<X className="size-3" />}
          onClick={() => onRemove(tag)}
          type="button"
          variant={ButtonVariant.UNSTYLED}
          withWrapper={false}
        />
      ) : null}
    </span>
  );
}
