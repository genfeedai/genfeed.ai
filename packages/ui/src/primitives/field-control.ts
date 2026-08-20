/*
 * Field controls paint with semantic roles only — never with the `.ship-ui`
 * utility names (`bg-tertiary`, `text-primary`, `text-muted`).
 *
 * Those names resolve through `.ship-ui .x` rules in `globals.css`, which cover
 * the bare utility and five `hover:` variants and nothing else. A variant-
 * prefixed use like `placeholder:text-muted` misses that block and falls
 * through to Tailwind's `@theme`, where `--color-muted` is a *surface* step
 * (#161616 dark / #F5F5F5 light). That painted placeholder text at 1.06:1 on
 * the field fill — invisible in both themes. Semantic roles carry the same
 * value at every variant and every specificity.
 */
export const fieldControlClassName =
  'ship-ui flex h-8 w-full min-w-0 rounded-lg border border-border bg-background-tertiary px-3 py-1.5 text-sm text-foreground transition-[color,box-shadow,border-color,background-color] duration-200 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-border-strong disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50';

export const fieldControlInputClassName =
  'file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground';

export const fieldControlTriggerClassName =
  'items-center justify-between gap-2 whitespace-nowrap [&>span]:line-clamp-1';

/** Floating menus sit on `bg-secondary` — darker than elevated/tertiary. */
export const overlayMenuSurfaceClassName =
  'bg-secondary text-primary shadow-dropdown';

export const fieldControlPopoverClassName = `ship-ui rounded-xl ${overlayMenuSurfaceClassName}`;
