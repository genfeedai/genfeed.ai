import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Frosted floating-panel surface for elevated popovers/menus.
 * Token-backed so they adapt to dark and parchment-light themes (no longer
 * hardcoded white/black). Names kept for back-compat across ~8 call sites.
 */
export const BG_BLUR =
  'bg-popover/80 backdrop-blur-xl supports-[backdrop-filter]:bg-popover/70';

/**
 * Containment for elevated floating panels (dropdowns, menus, switchers).
 * Uses the canonical `shadow-dropdown` token (inset hairline ring + drop
 * shadow) instead of a CSS border + arbitrary glow shadow, and an on-scale
 * overlay-panel radius. Name kept for back-compat across ~8 call sites.
 */
export const BORDER_WHITE_30 = 'rounded-lg shadow-dropdown';
