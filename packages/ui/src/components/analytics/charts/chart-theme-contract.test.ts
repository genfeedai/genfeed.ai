import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const chartsRoot = join(process.cwd(), 'src/components/analytics/charts');

const TOGGLE_CHART_SOURCES = [
  'brand-performance/brand-performance-chart.tsx',
  'platform-comparison/platform-comparison-chart.tsx',
  'platform-time-series/platform-time-series-chart.tsx',
  'post-performance/post-performance-chart.tsx',
  'time-series/time-series-chart.tsx',
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

  it('keeps the funnel series label legible while theming its summary divider', () => {
    const source = readChart(
      'video-completion-funnel/video-completion-funnel.tsx',
    );

    expect(source.match(/text-white/g)).toHaveLength(1);
    expect(source).not.toContain('border-white');
    expect(source).toContain('border-border');
  });
});
