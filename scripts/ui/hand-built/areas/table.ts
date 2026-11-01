import type { HandBuiltArea } from '../core';
import { scanRestyle } from '../restyle';

/**
 * `Table` owns spacing, striping and cell alignment through `size`,
 * `isStriped`, `align` and `tone`. Callers do not restyle the table family
 * with `className` (layout such as width stays allowed).
 */
const IMPORT_PATHS = [
  '@ui/primitives/table',
  '@genfeedai/ui/primitives/table',
] as const;

const area: HandBuiltArea = {
  id: 'table',
  scan: (source) =>
    ['Table', 'TableHead', 'TableCell'].flatMap((component) =>
      scanRestyle(source, {
        component,
        importPaths: IMPORT_PATHS,
        isSizeOwned: true,
        rule: 'table-restyle',
      }),
    ),
};

export default area;
