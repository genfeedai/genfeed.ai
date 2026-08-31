/**
 * Single width owner for agent transcript cards and the floating composer.
 * Keep padding identical so borders line up; min-w-0 prevents flex overflow
 * (min-width:auto on flex children is what creates the horizontal scrollbar).
 *
 * T3/Codex density: max-w-3xl (~48rem) conversation track — not full canvas.
 */
export const AGENT_CONVERSATION_TRACK_CLASS =
  'mx-auto w-full min-w-0 max-w-3xl px-3 sm:px-4';

/**
 * Sticky user prompts pin to this inset so banners/toolbars can push them
 * down without touching the message component (Cursor `--composer-messages-top-inset`).
 */
export const AGENT_CONVERSATION_STICKY_TOP_CLASS =
  'top-[var(--agent-conversation-sticky-top,0px)]';

/**
 * Scroll region: contain overscroll, disable browser scroll anchoring, and
 * reserve equal scrollbar gutters so the transcript stays centered on the
 * docked composer when a vertical scrollbar is present.
 * `--agent-conversation-sticky-top` is the Cursor-style inset for sticky
 * user prompts; override on this node when a banner sits above the transcript.
 */
export const AGENT_CONVERSATION_SCROLL_CLASS =
  'min-h-0 flex-1 overflow-y-auto overscroll-contain [overflow-anchor:none] [scrollbar-gutter:stable_both-edges] [--agent-conversation-sticky-top:0.75rem]';

/**
 * Off-screen assistant/work rows skip paint via content-visibility while
 * keeping an intrinsic height so sticky turns stay stable.
 */
export const AGENT_TIMELINE_DEFERRED_CLASS =
  '[content-visibility:auto] [contain-intrinsic-size:auto_160px]';

/** Shared card/composer border radius so edges match visually. */
export const AGENT_CONVERSATION_SURFACE_RADIUS_CLASS = 'rounded-xl';

/**
 * Sticky user prompt card (Cursor). Solid tertiary fill so the turn header
 * occludes scrolling assistant text; no "You" label — the card is the highlight.
 */
export const AGENT_CONVERSATION_USER_PROMPT_CARD_CLASS = [
  '-mx-3 w-[calc(100%+1.5rem)] max-w-none border border-border-strong bg-tertiary px-3 py-2.5 text-md leading-6 text-foreground sm:-mx-4 sm:w-[calc(100%+2rem)]',
  AGENT_CONVERSATION_SURFACE_RADIUS_CLASS,
].join(' ');

/** Assistant body — solid foreground so faded /90–/92 type cannot wash out. */
export const AGENT_ASSISTANT_PROSE_CLASS = 'text-md leading-6 text-foreground';

/**
 * Pins the user prompt to the scrollport and paints the canvas behind it so
 * assistant lines cannot show through the card's rounded corners.
 */
export const AGENT_CONVERSATION_STICKY_USER_TURN_CLASS = [
  'sticky',
  AGENT_CONVERSATION_STICKY_TOP_CLASS,
  "z-10 justify-start bg-background pb-2 before:pointer-events-none before:absolute before:inset-x-0 before:-top-3 before:h-3 before:bg-background before:content-['']",
].join(' ');

/**
 * Shared agent timeline card chrome — solid surface, T3/Codex density
 * (tighter radius, no translucent blur stack).
 */
export const AGENT_CONVERSATION_SURFACE_CLASS = [
  'border border-border-strong bg-tertiary text-foreground',
  AGENT_CONVERSATION_SURFACE_RADIUS_CLASS,
].join(' ');

/**
 * Borderless inline row for low-chrome timeline status (Done / work lines).
 * Prefer this over full cards when the turn already has a product result card.
 */
export const AGENT_CONVERSATION_INLINE_ROW_CLASS =
  'mt-1.5 flex w-full min-w-0 max-w-full items-center gap-2 py-1 text-left';
