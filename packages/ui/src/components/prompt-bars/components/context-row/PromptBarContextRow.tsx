'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type {
  PromptBarContextChipProps,
  PromptBarContextRowProps,
} from '@genfeedai/props/prompt-bars/prompt-bar-context-row.props';
import { usePromptBarRowFit } from '@hooks/prompt-bar/use-prompt-bar-row-fit/use-prompt-bar-row-fit';
import { Button } from '@ui/primitives/button';
import { X } from 'lucide-react';
import Image from 'next/image';
import { Fragment, type ReactElement, useRef } from 'react';

const CHIP_CLASS =
  'inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-border bg-tertiary text-xs text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground';

function PromptBarContextChip({
  isCompact,
  item,
}: PromptBarContextChipProps): ReactElement {
  const hasGlyph = Boolean(item.thumbnailUrl || item.icon);
  const isLabelHidden = item.isIconOnly || (isCompact && hasGlyph);
  const glyph = item.thumbnailUrl ? (
    <Image
      alt=""
      className="size-5 shrink-0 rounded-[5px] object-cover outline-media"
      height={20}
      sizes="20px"
      src={item.thumbnailUrl}
      width={20}
    />
  ) : (
    item.icon
  );
  const select = (
    <Button
      aria-pressed={item.isPressed}
      ariaLabel={item.ariaLabel ?? item.label}
      className={cn(
        item.onRemove ? 'inline-flex h-full items-center gap-1.5' : CHIP_CLASS,
        !item.onRemove && (isLabelHidden ? 'px-1' : 'pl-1.5 pr-2.5'),
        !item.onRemove && !hasGlyph && 'px-2.5',
        item.isPressed && 'text-foreground',
      )}
      onClick={item.onSelect}
      title={isLabelHidden ? item.label : undefined}
      variant={ButtonVariant.UNSTYLED}
      withWrapper={false}
    >
      {glyph}
      {isLabelHidden ? null : (
        <span className="max-w-48 truncate">{item.label}</span>
      )}
    </Button>
  );

  if (!item.onRemove) return select;

  return (
    <span
      className={cn(
        CHIP_CLASS,
        'text-foreground',
        isLabelHidden ? 'pl-1' : 'pl-1.5',
      )}
      data-testid="prompt-bar-context-pinned"
    >
      {select}
      <Button
        ariaLabel={item.removeLabel ?? item.label}
        className="size-6 shrink-0 p-0"
        icon={<X className="size-3" />}
        onClick={item.onRemove}
        size={ButtonSize.ICON}
        variant={ButtonVariant.GHOST}
        withWrapper={false}
      />
    </span>
  );
}

/**
 * The single row above the prompt that reflects the page: presets for what is
 * loaded, recent assets, or the current selection and its actions. It never
 * wraps; when it runs out of room, chips with a glyph drop their labels.
 */
export default function PromptBarContextRow({
  ariaLabel,
  groups,
}: PromptBarContextRowProps): ReactElement | null {
  const rowRef = useRef<HTMLDivElement>(null);
  const visibleGroups = groups.filter((group) => group.items.length > 0);
  const contentKey = visibleGroups
    .map((group) => group.items.map((item) => item.id).join(','))
    .join('|');
  const { isCompact } = usePromptBarRowFit({ contentKey, rowRef });

  if (visibleGroups.length === 0) return null;

  return (
    <div
      aria-label={ariaLabel}
      className="flex min-w-0 flex-nowrap items-center gap-1.5 overflow-x-auto px-3 pb-1 pt-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      data-compact={isCompact ? 'true' : undefined}
      data-testid="prompt-bar-context-row"
      ref={rowRef}
      role="toolbar"
    >
      {visibleGroups.map((group, index) => (
        <Fragment key={group.id}>
          {index > 0 ? (
            <span
              aria-hidden="true"
              className="mx-0.5 h-4 w-px shrink-0 bg-border"
            />
          ) : null}
          {group.label && !isCompact ? (
            <span className="shrink-0 text-xs text-muted-foreground">
              {group.label}
            </span>
          ) : null}
          {group.items.map((item) => (
            <PromptBarContextChip
              isCompact={isCompact}
              item={item}
              key={item.id}
            />
          ))}
        </Fragment>
      ))}
    </div>
  );
}
