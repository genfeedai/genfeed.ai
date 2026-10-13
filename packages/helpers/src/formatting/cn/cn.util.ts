import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

const HOVER_CAPABLE_VARIANT = '[@media(hover:hover)]';

// tailwind-merge treats that arbitrary media query as an unknown class, so a
// later opacity-100 does not replace opacity-0. Parse it as a variant.
const twMerge = extendTailwindMerge({
  experimentalParseClassName({ className, parseClassName }) {
    const prefix = `${HOVER_CAPABLE_VARIANT}:`;
    if (!className.startsWith(prefix)) {
      return parseClassName(className);
    }

    const parsed = parseClassName(className.slice(prefix.length));
    return {
      ...parsed,
      modifiers: [HOVER_CAPABLE_VARIANT, ...parsed.modifiers],
    };
  },
});

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
