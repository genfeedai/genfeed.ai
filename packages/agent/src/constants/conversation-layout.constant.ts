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
 * Scroll region: contain overscroll, disable browser scroll anchoring.
 * `--agent-conversation-sticky-top` is the Cursor-style inset for sticky
 * user prompts; override on this node when a banner sits above the transcript.
 */
export const AGENT_CONVERSATION_SCROLL_CLASS =
  'min-h-0 flex-1 overflow-y-auto overscroll-contain [overflow-anchor:none] [--agent-conversation-sticky-top:0px]';

/**
 * Off-screen assistant/work rows skip paint via content-visibility while
 * keeping an intrinsic height so sticky turns stay stable.
 */
export const AGENT_TIMELINE_DEFERRED_CLASS =
  '[content-visibility:auto] [contain-intrinsic-size:auto_160px]';

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
