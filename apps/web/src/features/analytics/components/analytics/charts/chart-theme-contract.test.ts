import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const chartsRoot = join(
  process.cwd(),
  'src/features/analytics/components/analytics/charts',
);

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
    'paints no fixed white chrome in the metric controls of %s',
    (relativePath) => {
      const source = readChart(relativePath);

      expect(source).not.toMatch(/(?:bg|border|text)-white/);
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

  it('avoids fixed black/white chrome in the platform time-series chart', () => {
    const source = readChart(
      'platform-time-series/platform-time-series-chart.tsx',
    );

    expect(source).not.toMatch(
      /\b(?:bg|border|divide|ring|text)-(?:black|white)(?:\b|\/|\[)/,
    );
    expect(source).not.toContain('overlay-white');
  });

  it('uses semantic chart grid, axis, and tick colors', () => {
    const source = readChart(
      'platform-time-series/platform-time-series-chart.tsx',
    );

    expect(source).toContain('stroke="hsl(var(--border))"');
    expect(source).toContain("tick={{ fill: 'hsl(var(--muted-foreground))' }}");
  });
});
