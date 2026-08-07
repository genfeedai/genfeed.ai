/**
 * Single width owner for agent transcript cards and the floating composer.
 * Keep padding identical so borders line up; min-w-0 prevents flex overflow
 * (min-width:auto on flex children is what creates the horizontal scrollbar).
 */
export const AGENT_CONVERSATION_TRACK_CLASS =
  'mx-auto w-full min-w-0 max-w-4xl px-3 sm:px-4';

/** Shared card/composer border radius so edges match visually. */
export const AGENT_CONVERSATION_SURFACE_RADIUS_CLASS = 'rounded-2xl';

/**
 * Shared agent timeline card chrome. Solid `bg-card` (not translucent /70 +
 * blur) so Done, batch result, and form cards read as the same surface.
 */
export const AGENT_CONVERSATION_SURFACE_CLASS = [
  'border border-border bg-card text-card-foreground shadow-sm',
  AGENT_CONVERSATION_SURFACE_RADIUS_CLASS,
].join(' ');
