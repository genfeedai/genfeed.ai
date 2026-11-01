import type { HandBuiltArea, HandBuiltFinding } from '../core';
import {
  classUtilities,
  finding,
  SHARED_PACKAGE,
  tagNameOf,
  walkJsx,
} from '../jsx';
import { scanRestyle } from '../restyle';

/**
 * One stat tile: `MetricCard` (tile, inline or plain) from
 * `@ui/cards/metric-card/MetricCard`. A small label above a large bold value
 * is a metric, not a hand-built pair of text elements.
 */
const LABEL_TEXT = /^text-(2xs|xs|sm)$/;
const VALUE_TEXT = /^text-(xl|2xl|3xl|4xl|5xl)$/;
const WEIGHT = /^font-(semibold|bold|black)$/;
const DIM_LABEL = /^(uppercase|text-muted-foreground|text-foreground\/\d+)$/;
const TEXT_TAGS = new Set(['p', 'span', 'div', 'dt', 'dd']);

const area: HandBuiltArea = {
  id: 'metric',
  scan: (source) => {
    if (SHARED_PACKAGE.test(source.file)) {
      return [];
    }
    const findings: HandBuiltFinding[] = scanRestyle(source, {
      component: 'MetricCard',
      importPaths: ['@ui/cards/metric-card/MetricCard'],
      isDefaultExport: true,
      isSizeOwned: false,
      rule: 'metric-card-restyle',
    });

    walkJsx(source, (tag, children, constants) => {
      const textChildren = children.filter((child) =>
        TEXT_TAGS.has(tagNameOf(source, child)),
      );
      if (textChildren.length !== 2 || children.length !== 2) {
        return;
      }
      const [first, second] = textChildren.map((child) => [
        ...classUtilities(source, child, constants),
      ]);
      const isLabel =
        first.some((token) => LABEL_TEXT.test(token)) &&
        first.some((token) => DIM_LABEL.test(token));
      const isValue =
        second.some((token) => VALUE_TEXT.test(token)) &&
        second.some((token) => WEIGHT.test(token));
      if (isLabel && isValue) {
        findings.push(
          ...finding(
            source,
            tag,
            'metric-hand-built',
            'A small label above a large bold value is a metric. Use MetricCard (appearance="plain" for an unframed block).',
          ),
        );
      }
    });

    return findings;
  },
};

export default area;
