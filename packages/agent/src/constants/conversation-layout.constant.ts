/**
 * Single width owner for agent transcript cards and the floating composer.
 * Keep padding identical so the column lines up; min-w-0 prevents flex overflow
 * (min-width:auto on flex children is what creates the horizontal scrollbar).
 *
 * T3/Codex density: max-w-3xl (~48rem) conversation track — not full canvas.
 */
export const AGENT_CONVERSATION_TRACK_CLASS =
  'mx-auto w-full min-w-0 max-w-3xl px-3 sm:px-4';

/**
 * Scroll region: contain overscroll, disable browser scroll anchoring, and
 * reserve equal scrollbar gutters so the transcript stays centered on the
 * composer when a vertical scrollbar is present. Only the transcript scrolls:
 * the composer is a sibling below it, never inside it, so nothing the
 * transcript does can move the prompt bar.
 */
export const AGENT_CONVERSATION_SCROLL_CLASS =
  'flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain [overflow-anchor:none] [scrollbar-gutter:stable_both-edges]';

/** Timeline product cards — not the docked composer (`--radius-workspace-composer`). */
export const AGENT_CONVERSATION_SURFACE_RADIUS_CLASS = 'rounded-xl';

/**
 * The user's message: a compact bubble on the right of the track, sized to its
 * text (Claude desktop). It scrolls with the transcript; it never pins.
 */
export const AGENT_CONVERSATION_USER_BUBBLE_CLASS =
  'w-fit max-w-[85%] rounded-2xl bg-tertiary px-4 py-2.5 text-card-foreground';

/** Assistant body — solid foreground so faded /90–/92 type cannot wash out. */
export const AGENT_ASSISTANT_PROSE_CLASS = 'text-sm leading-6 text-foreground';

/**
 * Shared agent timeline card chrome — card plane, T3/Codex density
 * (tighter radius, no translucent blur stack).
 */
export const AGENT_CONVERSATION_SURFACE_CLASS = [
  'border border-border-strong bg-card text-foreground',
  AGENT_CONVERSATION_SURFACE_RADIUS_CLASS,
].join(' ');

/**
 * Borderless inline row for low-chrome timeline status (Done / work lines).
 * Prefer this over full cards when the turn already has a product result card.
 */
export const AGENT_CONVERSATION_INLINE_ROW_CLASS =
  'mt-1.5 flex w-full min-w-0 max-w-full items-center gap-2 py-1 text-left';
