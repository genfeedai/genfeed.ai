import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const chartsRoot = join(process.cwd(), 'src/components/analytics/charts');

const TOGGLE_CHART_SOURCES = [
  'brand-performance/brand-performance-chart.tsx',
  'platform-comparison/platform-comparison-chart.tsx',
  'platform-time-series/platform-time-series-chart.tsx',
] as const;

function readChart(relativePath: string): string {
  return readFileSync(join(chartsRoot, relativePath), 'utf8');
}

describe('analytics chart theme contract', () => {
  it.each(TOGGLE_CHART_SOURCES)(
    'uses semantic colors for metric controls in %s',
    (relativePath) => {
      const source = readChart(relativePath);

      expect(source).not.toMatch(/(?:bg|border|text)-white/);
      expect(source).toContain('border-border-strong bg-muted text-foreground');
      expect(source).toContain(
        'border-border/60 bg-transparent text-muted-foreground',
      );
    },
  );

  it.each([
    ...TOGGLE_CHART_SOURCES,
    'platform-breakdown/platform-breakdown-chart.tsx',
  ])(
    'never paints with the dark-only overlay-white ladder in %s',
    (relativePath) => {
      expect(readChart(relativePath)).not.toContain('--overlay-white-');
    },
  );
});
