import type { HandBuiltArea } from '../core';
import { scanRestyle } from '../restyle';

/**
 * Badge and Alert each have one component, `@ui/primitives/badge` and
 * `@ui/primitives/alert`. Callers pick a variant (or size) and never restyle
 * them with `className`.
 */
const area: HandBuiltArea = {
  id: 'badge-alert',
  scan: (source) => [
    ...scanRestyle(source, {
      component: 'Badge',
      importPaths: ['@ui/primitives/badge'],
      isSizeOwned: true,
      rule: 'badge-restyle',
    }),
    ...scanRestyle(source, {
      component: 'Alert',
      importPaths: ['@ui/primitives/alert', '@genfeedai/ui/primitives/alert'],
      isSizeOwned: false,
      rule: 'alert-restyle',
    }),
  ],
};

export default area;
