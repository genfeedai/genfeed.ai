import { scanChips } from '../chip';
import type { HandBuiltArea } from '../core';
import { scanRestyle } from '../restyle';

/**
 * Badges, pills, chips and count dots are `Badge` from `@ui/primitives/badge`.
 * Callers pick a variant, shape or size and never restyle it with `className`
 * or rebuild it from a `span`.
 */
const area: HandBuiltArea = {
  id: 'badge',
  scan: (source) => [
    ...scanRestyle(source, {
      component: 'Badge',
      importPaths: ['@ui/primitives/badge', '@genfeedai/ui/primitives/badge'],
      isSizeOwned: true,
      isToneLookupFlagged: true,
      rule: 'badge-restyle',
    }),
    ...scanChips(source, 'badge-hand-built'),
  ],
};

export default area;
