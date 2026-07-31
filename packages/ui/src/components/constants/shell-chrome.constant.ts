/**
 * Shell chrome icon + control sizing.
 *
 * Two intentional tiers (do not invent a third for toolbar work):
 * - **chrome** (`size-3.5` / 14px) — toolbars, filters, view toggles, refresh,
 *   clear, segmented shell buttons, compact icon buttons
 * - **content** (`size-4` / 16px) — sidebar nav, modal chrome, menus, form
 *   field adornments, default toggle size
 *
 * Prefer these constants over hardcoding `size-3` / `size-3.5` / `size-4` /
 * `text-lg` on Lucide icons. Never use font-size utilities (`text-lg`) to size
 * SVG icons — Lucide ignores them inconsistently.
 */

/** Compact chrome glyph (14px). Toolbars / filters / shell controls. */
export const SHELL_ICON_CLASS = 'size-3.5 shrink-0';

/** Default content glyph (16px). Nav, menus, modals, form adornments. */
export const CONTENT_ICON_CLASS = 'size-4 shrink-0';

/**
 * Force descendant SVGs to chrome size — use on shell control wrappers when
 * children pass arbitrary icon nodes.
 */
export const SHELL_ICON_SVG_CLASS = '[&_svg]:size-3.5';

/** Compact square hit target for icon-only shell buttons (refresh, etc.). */
export const SHELL_ICON_BUTTON_CLASS = 'size-8 shrink-0 p-0 [&_svg]:size-3.5';

/** Compact control row height used by toolbars and filter triggers. */
export const SHELL_CONTROL_HEIGHT_CLASS = 'h-8';
