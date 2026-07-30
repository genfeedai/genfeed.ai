/**
 * Shared chrome for org + brand labeled switchers so the topbar / sidebar
 * header don't drift (different px, gap, avatar size, label weight).
 */
export const SWITCHER_TRIGGER_CLASSNAME =
  'flex h-8 w-full min-w-0 cursor-pointer items-center gap-2 rounded-md px-2.5 text-left transition-colors duration-150 hover:bg-foreground/[0.06]';

export const SWITCHER_TRIGGER_OPEN_CLASSNAME = 'bg-foreground/[0.06]';

export const SWITCHER_AVATAR_CLASSNAME =
  'flex size-6 flex-shrink-0 items-center justify-center overflow-hidden rounded-md bg-foreground/20 text-xs font-semibold text-foreground';

export const SWITCHER_LABEL_CLASSNAME =
  'min-w-0 flex-1 truncate text-left text-[13px] font-semibold text-foreground';

export const SWITCHER_CHEVRON_CLASSNAME =
  'size-3.5 flex-shrink-0 text-foreground/45 transition-transform duration-200';

/**
 * One shell for brand trigger + clear — single chip, not two boxes.
 * Hover/open fill lives on the shell; inner buttons stay transparent.
 */
export const SWITCHER_COMPOSITE_SHELL_CLASSNAME =
  'flex h-8 w-full min-w-0 items-center rounded-md transition-colors duration-150 hover:bg-foreground/[0.06]';

/** Trigger segment inside the composite shell (no own hover fill). */
export const SWITCHER_COMPOSITE_TRIGGER_CLASSNAME =
  'flex h-8 min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-l-md px-2.5 text-left';

/** Clear segment — hairline divider only, no second bordered control. */
export const SWITCHER_COMPOSITE_CLEAR_CLASSNAME =
  'flex h-8 w-7 flex-shrink-0 items-center justify-center rounded-r-md border-l border-foreground/[0.08] text-foreground/45 transition-colors duration-150 hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50';
