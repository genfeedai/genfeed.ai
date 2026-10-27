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

/** Prompt-bar chip (Agent mode, Studio type, Enhance, `+`): icon + label + chevron. */
export const PROMPT_BAR_CHIP_CLASS =
  'h-8 shrink-0 gap-1.5 px-2 text-xs text-foreground';

/**
 * Every prompt-bar control is a 32px box with a 14px (chrome tier) glyph. A
 * square icon-only button (mic, send, stop, harness settings) uses this so the
 * glyph sits dead centre: the button primitive adds nothing the box does not
 * already centre.
 */
export const PROMPT_BAR_ICON_BUTTON_CLASS =
  'size-8 min-h-0 min-w-0 shrink-0 justify-center p-0';

/**
 * Prompt-bar chips share one size at every width: labelled while the toolbar
 * row (a `@container/prompt-bar`, see `PromptBarToolbar`) is at least 860px
 * wide, then every chip, left or right, keeps its icon and drops its label
 * together, with the 44px hit area it would otherwise lose. The collapsed chip
 * is the same 32px square as an icon button: the primitive's extra left padding
 * for a leading icon is reset so the glyph is centred, not nudged.
 */
export const PROMPT_BAR_CHIP_FIT_CLASS =
  "@max-[859px]/prompt-bar:relative @max-[859px]/prompt-bar:w-8 @max-[859px]/prompt-bar:justify-center @max-[859px]/prompt-bar:px-0 @max-[859px]/prompt-bar:has-[>svg:first-child]:pl-0! @max-[859px]/prompt-bar:after:absolute @max-[859px]/prompt-bar:after:-inset-1.5 @max-[859px]/prompt-bar:after:content-['']";

/** Label (and chevron) of a prompt-bar chip; hidden with the rest below 860px. */
export const PROMPT_BAR_CHIP_LABEL_CLASS = '@max-[859px]/prompt-bar:hidden';

/** Setup chips fold into the More setup menu when the toolbar row is narrower than this. */
export const PROMPT_BAR_SETUP_FOLD_CLASS = '@max-[339px]/prompt-bar:hidden';

/** Width of a setup panel opened from the More setup menu. */
export const PROMPT_BAR_SETUP_MENU_CLASS =
  'w-[min(360px,calc(100vw-2rem))] p-0';

/** Compact square hit target for icon-only shell buttons (refresh, etc.). */
export const SHELL_ICON_BUTTON_CLASS = 'size-8 shrink-0 p-0 [&_svg]:size-3.5';

import { controlHeightClassName } from '@ui/primitives/field-control';

/** Compact control row height used by toolbars and filter triggers. */
export const SHELL_CONTROL_HEIGHT_CLASS = controlHeightClassName;
