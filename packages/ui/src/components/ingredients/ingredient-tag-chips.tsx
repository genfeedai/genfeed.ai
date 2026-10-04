'use client';

import type { ITag } from '@genfeedai/contracts/interfaces';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import LibraryTagChip from '@ui/tags/library-tag-picker/LibraryTagChip';
import { useTranslations } from 'next-intl';

export interface IngredientTagChipsProps {
  className?: string;
  /** Chips shown before the rest collapse into a count. */
  max?: number;
  tags?: readonly ITag[];
}

const DEFAULT_MAX_CHIPS = 3;

/**
 * The tags on a Library card or row. Beyond `max` the rest collapse into a
 * "+N" count that names them in its title, so a heavily tagged asset never
 * grows its card.
 */
export default function IngredientTagChips({
  tags,
  ...props
}: IngredientTagChipsProps) {
  // Most assets carry no tags; they render nothing and never touch the
  // translation context.
  if (!tags || tags.length === 0) {
    return null;
  }

  return <TagChipList tags={tags} {...props} />;
}

function TagChipList({
  className,
  max = DEFAULT_MAX_CHIPS,
  tags = [],
}: IngredientTagChipsProps) {
  const translate = useTranslations('pages.library.tags');
  const visible = tags.slice(0, max);
  const hidden = tags.slice(max);

  return (
    <div
      aria-label={translate('sectionLabel')}
      className={cn('flex min-w-0 flex-wrap items-center gap-1', className)}
      role="list"
    >
      {visible.map((tag) => (
        <span className="min-w-0 max-w-full" key={tag.id} role="listitem">
          <LibraryTagChip tag={tag} />
        </span>
      ))}
      {hidden.length > 0 ? (
        <span
          className="rounded-full bg-foreground/10 px-2 py-0.5 text-xs font-medium text-foreground"
          role="listitem"
          title={hidden.map((tag) => tag.label).join(', ')}
        >
          {translate('moreTags', { count: hidden.length })}
        </span>
      ) : null}
    </div>
  );
}
