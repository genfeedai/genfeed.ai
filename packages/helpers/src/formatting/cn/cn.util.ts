import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Frosted floating-panel surface + border for elevated popovers/menus.
 * Token-backed so they adapt to dark and parchment-light themes (no longer
 * hardcoded white/black). Names kept for back-compat across ~8 call sites.
 */
export const BG_BLUR =
  'bg-popover/80 backdrop-blur-xl supports-[backdrop-filter]:bg-popover/70';

export const BORDER_WHITE_30 =
  'rounded-2xl border border-border shadow-[0_-8px_32px_rgba(0,0,0,0.45)]';
