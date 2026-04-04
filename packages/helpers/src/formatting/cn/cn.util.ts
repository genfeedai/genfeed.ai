import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const BG_BLUR =
  'bg-gradient-to-t from-black/80 via-black/68 to-black/52 backdrop-blur-xl supports-[backdrop-filter]:bg-black/60';

export const BORDER_WHITE_30 =
  'rounded-2xl border border-white/[0.16] shadow-[0_-8px_32px_rgba(0,0,0,0.45)]';
