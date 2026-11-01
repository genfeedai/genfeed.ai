import type { HandBuiltArea } from '../core';
import { SHARED_PACKAGE } from '../jsx';
import { scanRestyle } from '../restyle';

/**
 * One stat tile: `MetricCard` from `@ui/cards/metric-card/MetricCard`. Call
 * sites pick `appearance`, `size` and `tone`; they never restyle the tile.
 * Hand-built label/value pairs are caught by the `hand-built-stat` rule in
 * `cards.ts`.
 */
const area: HandBuiltArea = {
  id: 'metric',
  scan: (source) => {
    if (SHARED_PACKAGE.test(source.file)) {
      return [];
    }
    return scanRestyle(source, {
      component: 'MetricCard',
      importPaths: [
        '@ui/cards/metric-card/MetricCard',
        '@ui/components/cards/metric-card/MetricCard',
      ],
      isDefaultExport: true,
      isSizeOwned: false,
      isToneLookupFlagged: true,
      rule: 'metric-card-restyle',
    });
  },
};

export default area;
