/*
 * Field controls paint with semantic roles and ladder steps only. Placeholders
 * use `text-gray-800` (the placeholder step, AA on both canvases) so they read
 * quieter than typed text. Never `placeholder:text-muted`: that resolves
 * `--color-muted`, a *surface* step, and paints invisible placeholder text.
 */
/**
 * Compact control row height shared by toolbars, filter triggers, tabs, and
 * every field control. Lives in primitives (not `components/constants`) because
 * the package build compiles primitives without the components tree.
 */
export const controlHeightClassName = 'h-8';

export const fieldControlClassName =
  'flex h-8 w-full min-w-0 rounded-md border border-border bg-tertiary px-3 py-1.5 text-sm text-foreground transition-[color,box-shadow,border-color,background-color] duration-200 placeholder:text-gray-800 focus-visible:outline-none focus-visible:border-border-strong disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50';

export const fieldControlInputClassName =
  'file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground';

export const fieldControlTriggerClassName =
  'items-center justify-between gap-2 whitespace-nowrap [&>span]:line-clamp-1';

/**
 * Floating menus sit on `bg-muted` — darker than elevated/tertiary.
 * `shadow-dropdown` owns the single inset hairline; consumers must not add a
 * CSS border on top of it.
 */
export const overlayMenuSurfaceClassName =
  'bg-muted text-foreground shadow-dropdown';

/**
 * Field menus are commonly opened from an already-portalled panel. Keep this
 * layer one step above panel/menu chrome (`z-[10001]`) so a Select or calendar
 * cannot be painted behind the surface that owns its trigger.
 */
export const fieldControlPopoverClassName = `z-[10002] rounded-xl ${overlayMenuSurfaceClassName}`;
