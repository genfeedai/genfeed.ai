import { cn } from '@genfeedai/helpers/formatting/cn/cn.util';

/**
 * Visibility and interactivity of a masonry tile's actions bar share one
 * source of truth: every condition that reveals the bar also makes it
 * clickable. CSS `:hover` on the tile (`group-hover`) and keyboard focus reveal
 * it immediately; React hover state (`isRevealed`) keeps it open while the
 * pointer travels into a portalled dropdown. Revealing opacity alone would leave
 * a visible More control that a fast click passes through to the card.
 */
export function getMasonryActionsBarClassName(isRevealed: boolean): string {
  return cn(
    'absolute top-2 right-2 z-50 overflow-visible transition-opacity duration-200',
    'group-hover:pointer-events-auto group-hover:opacity-100',
    'focus-within:pointer-events-auto focus-within:opacity-100',
    isRevealed
      ? 'pointer-events-auto opacity-100'
      : 'pointer-events-none opacity-0',
  );
}
