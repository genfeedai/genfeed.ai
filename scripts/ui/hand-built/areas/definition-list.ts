import type { HandBuiltArea } from '../core';
import {
  classUtilities,
  finding,
  SHARED_PACKAGE,
  tagNameOf,
  walkJsx,
} from '../jsx';

/**
 * Key/value pairs use `DefinitionList` (+ `DefinitionRow`, `DefinitionTerm`,
 * `DefinitionDetail`) from `@ui/primitives/definition-list`. A `<dl>`, or a
 * row with a `<dt>`, that lays itself out with a fixed-width first column is
 * a hand-built copy of its `properties` and `ruled` variants.
 */
const FIXED_FIRST_COLUMN = /^grid-cols-\[(auto|\d+(\.\d+)?(rem|px))_/;

const area: HandBuiltArea = {
  id: 'definition-list',
  scan: (source) => {
    if (SHARED_PACKAGE.test(source.file)) {
      return [];
    }
    const findings: ReturnType<HandBuiltArea['scan']> = [];
    walkJsx(source, (tag, children, constants) => {
      const hasTerm = children.some(
        (child) => tagNameOf(source, child) === 'dt',
      );
      if (tagNameOf(source, tag) !== 'dl' && !hasTerm) {
        return;
      }
      const isGrid = [...classUtilities(source, tag, constants)].some((token) =>
        FIXED_FIRST_COLUMN.test(token),
      );
      if (isGrid) {
        findings.push(
          ...finding(
            source,
            tag,
            'definition-list-hand-built',
            'A term/detail grid with a fixed first column is DefinitionList variant="properties" (or "ruled" with DefinitionRow variant="split").',
          ),
        );
      }
    });
    return findings;
  },
};

export default area;
