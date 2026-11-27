import type { LibraryElementKind } from '@genfeedai/contracts';
import { Mountain, Package, Palette, UserRound } from 'lucide-react';

/** Icon and message key of every kind the References page lists. */
export const LIBRARY_ELEMENT_KIND_ICONS = {
  CHARACTER: UserRound,
  LOCATION: Mountain,
  PROP: Package,
  STYLE: Palette,
} as const satisfies Record<LibraryElementKind, typeof UserRound>;
