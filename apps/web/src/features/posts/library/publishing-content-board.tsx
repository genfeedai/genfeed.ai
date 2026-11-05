'use client';

import { ButtonSize, ButtonVariant } from '@genfeedai/contracts';
import { cn } from '@helpers/formatting/cn/cn.util';
import { Button } from '@ui/primitives/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { PublishingContentBoardProps } from '@/features/posts/props/publishing-content-entry.props';
import { useDragToPan } from '@/hooks/ui/use-drag-to-pan/use-drag-to-pan';
import {
  useHorizontalWheelScroll,
  VERTICAL_SCROLL_REGION_ATTRIBUTE,
} from '@/hooks/ui/use-horizontal-wheel-scroll/use-horizontal-wheel-scroll';
import { useScrollEdges } from '@/hooks/ui/use-scroll-edges/use-scroll-edges';

const VERTICAL_SCROLL_REGION = { [VERTICAL_SCROLL_REGION_ATTRIBUTE]: '' };
/** A drag that starts on a column's cards selects or opens, it never pans. */
const DRAG_IGNORE_SELECTOR = `[${VERTICAL_SCROLL_REGION_ATTRIBUTE}],a,button`;
/** One column (w-72) plus the gap (gap-3). */
const COLUMN_STEP_PX = 300;

/**
 * The Posts board: one fixed-width column per status. The board scrolls
 * sideways with a plain mouse wheel, a trackpad, the arrow keys, the edge
 * arrows or a drag on its background, and each column scrolls its own cards.
 * The edges fade while there is more to see, and an empty column shows a
 * dashed box.
 */
export default function PublishingContentBoard({
  columns,
  renderCard,
}: PublishingContentBoardProps) {
  const translate = useTranslations('pages.posts.list.collection.board');
  const boardRef = useHorizontalWheelScroll<HTMLDivElement>();
  const { canScrollEnd, canScrollStart } = useScrollEdges(boardRef);
  useDragToPan(boardRef, DRAG_IGNORE_SELECTOR);

  const scrollByColumn = (direction: -1 | 1) => {
    boardRef.current?.scrollBy({
      behavior: 'smooth',
      left: direction * COLUMN_STEP_PX,
    });
  };

  return (
    <div className="relative">
      <div
        ref={boardRef}
        aria-label={translate('label')}
        className="flex cursor-grab gap-3 overflow-x-auto overscroll-x-contain pb-3 data-[panning]:cursor-grabbing data-[panning]:select-none"
        role="region"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: the scrollable board takes focus so the arrow keys can scroll it
        tabIndex={0}
      >
        {columns.map((column) => (
          <section
            key={column.status}
            aria-label={column.label}
            className="flex h-[70vh] w-72 shrink-0 cursor-auto flex-col rounded-lg border border-border bg-card"
          >
            <h2 className="flex shrink-0 cursor-grab items-center justify-between gap-2 border-b border-border px-3 py-2.5 text-sm font-medium">
              <span>{column.label}</span>
              <span className="text-muted-foreground tabular-nums">
                {column.items.length}
              </span>
            </h2>
            <div
              {...VERTICAL_SCROLL_REGION}
              className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-y-contain p-3"
            >
              {column.items.length > 0 ? (
                column.items.map(renderCard)
              ) : (
                <p className="flex flex-1 items-center justify-center rounded-md border border-dashed border-border px-4 text-center text-sm text-muted-foreground">
                  {translate('empty', { status: column.label.toLowerCase() })}
                </p>
              )}
            </div>
          </section>
        ))}
      </div>
      <div
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute top-0 bottom-3 left-0 w-10 bg-gradient-to-r from-background to-transparent transition-opacity',
          canScrollStart ? 'opacity-100' : 'opacity-0',
        )}
      />
      <div
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute top-0 bottom-3 right-0 w-10 bg-gradient-to-l from-background to-transparent transition-opacity',
          canScrollEnd ? 'opacity-100' : 'opacity-0',
        )}
      />
      {canScrollStart ? (
        <Button
          ariaLabel={translate('scrollLeft')}
          className="absolute top-1/2 left-2 -translate-y-1/2 rounded-full shadow-md"
          icon={<ChevronLeft aria-hidden="true" />}
          size={ButtonSize.ICON}
          variant={ButtonVariant.SECONDARY}
          withWrapper={false}
          onClick={() => scrollByColumn(-1)}
        />
      ) : null}
      {canScrollEnd ? (
        <Button
          ariaLabel={translate('scrollRight')}
          className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full shadow-md"
          icon={<ChevronRight aria-hidden="true" />}
          size={ButtonSize.ICON}
          variant={ButtonVariant.SECONDARY}
          withWrapper={false}
          onClick={() => scrollByColumn(1)}
        />
      ) : null}
    </div>
  );
}
