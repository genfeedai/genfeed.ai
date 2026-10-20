import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';
import type { PromptBarToolbarProps } from '@genfeedai/props/prompt-bars/prompt-bar-toolbar.props';
import type { ReactElement } from 'react';

const SCROLL_CLASS =
  '-my-1.5 flex flex-nowrap items-center gap-1 overflow-x-auto py-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden';
const SCROLLER_CLASS = cn(SCROLL_CLASS, 'min-w-0 flex-1');
// With a pinned control the tools keep room for at least a few icons; when
// the pinned control leaves less than this, they wrap onto their own line
// instead of collapsing to zero width, so the first tool stays reachable.
const WRAPPED_SCROLLER_CLASS = cn(
  SCROLL_CLASS,
  'min-w-24 flex-1 basis-24 empty:hidden',
);

/**
 * The one prompt-bar toolbar row shared by Agent and Studio: tools on the
 * left, setup and submission on the right. Surfaces only fill the slots.
 * The row never wraps: submission keeps its size and the tools scroll
 * sideways when they run out of room. The scroller keeps 6px of vertical
 * padding (cancelled by the negative margin) so the 44px touch targets that
 * 32px icon buttons extend with `::after` are not clipped by its overflow.
 * A surface's primary control goes in `pinnedLeading`: it keeps its full hit
 * area and its width however many tools follow it. Only that layout wraps:
 * when the row cannot hold the pinned control, the tools and submission on
 * one line, the tools drop to the next line (with submission beside them if
 * it fits, else on a line of its own, right-aligned), so no control is
 * squeezed to zero width or overlaps another. A pinned control wider than the
 * whole row scrolls sideways within it.
 */
export default function PromptBarToolbar({
  className,
  density = 'default',
  leading,
  leadingLabel,
  pinnedLeading,
  trailing,
  trailingLabel,
}: PromptBarToolbarProps): ReactElement {
  return (
    <div
      className={cn(
        'mt-2 flex min-w-0 justify-between',
        pinnedLeading
          ? 'flex-wrap items-start gap-x-1 gap-y-0.5'
          : 'flex-nowrap items-center gap-2',
        density === 'compact' ? 'min-h-8' : 'min-h-9',
        className,
      )}
      data-prompt-bar-toolbar=""
      data-testid="prompt-bar-toolbar"
    >
      {pinnedLeading ? (
        // `contents` keeps the labelled group for assistive tech while the
        // pinned control, the tools and submission wrap as siblings.
        <div
          aria-label={leadingLabel}
          className="contents"
          data-prompt-bar-leading=""
          role="group"
        >
          <div className={cn(SCROLL_CLASS, 'max-w-full shrink-0')}>
            {pinnedLeading}
          </div>
          <div className={WRAPPED_SCROLLER_CLASS}>{leading}</div>
        </div>
      ) : (
        <div
          aria-label={leadingLabel}
          className={SCROLLER_CLASS}
          data-prompt-bar-leading=""
          role="group"
        >
          {leading}
        </div>
      )}
      <div
        aria-label={trailingLabel}
        className={cn(
          'ml-auto flex shrink-0 flex-nowrap items-center justify-end gap-1',
          pinnedLeading && 'pl-1',
        )}
        role="group"
      >
        {trailing}
      </div>
    </div>
  );
}
