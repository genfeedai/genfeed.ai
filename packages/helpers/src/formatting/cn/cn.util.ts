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
 * Frosted, contained surface for elevated floating panels (dropdowns, menus,
 * quick-action shells): token-backed translucent popover fill with blur, the
 * canonical `shadow-dropdown` ring + drop shadow, and the overlay-panel radius.
 */
export const FLOATING_PANEL_SURFACE =
  'rounded-lg shadow-dropdown bg-popover/80 backdrop-blur-xl supports-[backdrop-filter]:bg-popover/70';
