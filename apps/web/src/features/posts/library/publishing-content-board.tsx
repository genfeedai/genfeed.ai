'use client';

import { useTranslations } from 'next-intl';
import type { PublishingContentBoardProps } from '@/features/posts/props/publishing-content-entry.props';
import {
  useHorizontalWheelScroll,
  VERTICAL_SCROLL_REGION_ATTRIBUTE,
} from '@/hooks/ui/use-horizontal-wheel-scroll/use-horizontal-wheel-scroll';

const VERTICAL_SCROLL_REGION = { [VERTICAL_SCROLL_REGION_ATTRIBUTE]: '' };

/**
 * The Posts board: one fixed-width column per status. The board scrolls
 * sideways with a plain mouse wheel, a trackpad or the arrow keys, and each
 * column scrolls its own cards. An empty column shows a dashed box.
 */
export default function PublishingContentBoard({
  columns,
  renderCard,
}: PublishingContentBoardProps) {
  const translate = useTranslations('pages.posts.list.collection.board');
  const boardRef = useHorizontalWheelScroll<HTMLDivElement>();

  return (
    <div
      ref={boardRef}
      aria-label={translate('label')}
      className="flex gap-3 overflow-x-auto overscroll-x-contain pb-3"
      role="region"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: the scrollable board takes focus so the arrow keys can scroll it
      tabIndex={0}
    >
      {columns.map((column) => (
        <section
          key={column.status}
          aria-label={column.label}
          className="flex h-[70vh] w-72 shrink-0 flex-col rounded-lg border border-border bg-card"
        >
          <h2 className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2.5 text-sm font-medium">
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
  );
}
