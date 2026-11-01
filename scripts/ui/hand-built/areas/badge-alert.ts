import type { HandBuiltArea } from '../core';
import { scanRestyle } from '../restyle';

/**
 * Alert has one component, `@ui/primitives/alert`. Callers pick a variant and
 * never restyle it with `className`. Badges have their own area, `badge`; this baseline now holds Alert only.
 */
const area: HandBuiltArea = {
  id: 'badge-alert',
  scan: (source) =>
    scanRestyle(source, {
      component: 'Alert',
      importPaths: ['@ui/primitives/alert'],
      isSizeOwned: false,
      rule: 'alert-restyle',
    }),
};

export default area;
