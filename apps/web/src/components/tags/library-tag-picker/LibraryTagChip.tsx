'use client';

import type { ITag } from '@genfeedai/contracts/interfaces';
import { Badge } from '@ui/primitives/badge';
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
    <Badge
      casing="normal"
      className={className}
      colors={colors ?? undefined}
      isTruncated
      onRemove={onRemove ? () => onRemove(tag) : undefined}
      removeLabel={removeLabel}
      shape="pill"
      size="lg"
      title={tag.label}
      variant={colors ? 'custom' : 'secondary'}
    >
      {tag.label}
    </Badge>
  );
}
