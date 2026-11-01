import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ANALYTICS_ROOT = import.meta.dirname;

function readAnalytics(relativePath: string): string {
  return readFileSync(join(ANALYTICS_ROOT, relativePath), 'utf8');
}

describe('analytics semantic theme surfaces', () => {
  it.each([
    [
      'overview/analytics-overview-placeholder-card.tsx',
      'bg-white/5',
      'bg-foreground/5',
    ],
    // These delegate their surfaces to `@ui/kpi/kpi-section` (MetricCard owns
    // the icon chip tone); only the forbidden token is still their concern.
    ['platform-detail/analytics-platform-detail.tsx', 'bg-white/10', null],
    ['brand-overview/BrandKPISection.tsx', 'bg-white/10', null],
  ])(
    'removes fixed dark-only chrome from %s',
    (relativePath, forbiddenToken, semanticToken: string | null) => {
      const source = readAnalytics(relativePath);

      // A `null` semantic token means the file hands the surface to a shared
      // `@ui` primitive, which owns the semantic classes and guards them in
      // its own contract test.
      if (semanticToken !== null) {
        expect(source).toContain(semanticToken);
      }

      expect(source).not.toContain(forbiddenToken);
    },
  );
});
