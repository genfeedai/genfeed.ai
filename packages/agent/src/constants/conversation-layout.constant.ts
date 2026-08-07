/**
 * Single width owner for agent transcript cards and the floating composer.
 * Keep padding identical so borders line up; min-w-0 prevents flex overflow
 * (min-width:auto on flex children is what creates the horizontal scrollbar).
 */
export const AGENT_CONVERSATION_TRACK_CLASS =
  'mx-auto w-full min-w-0 max-w-4xl px-3 sm:px-4';

/** Shared card/composer border radius so edges match visually. */
export const AGENT_CONVERSATION_SURFACE_RADIUS_CLASS = 'rounded-xl';

/**
 * Shared agent timeline card chrome — solid surface, T3/Codex density
 * (tighter radius, no translucent blur stack).
 */
export const AGENT_CONVERSATION_SURFACE_CLASS = [
  'border border-border/80 bg-card text-card-foreground',
  AGENT_CONVERSATION_SURFACE_RADIUS_CLASS,
].join(' ');

/**
 * Borderless inline row for low-chrome timeline status (Done / work lines).
 * Prefer this over full cards when the turn already has a product result card.
 */
export const AGENT_CONVERSATION_INLINE_ROW_CLASS =
  'mt-1.5 flex w-full min-w-0 max-w-full items-center gap-2 py-1 text-left';
