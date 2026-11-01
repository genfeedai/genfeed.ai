import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const TRENDS_ROOT = import.meta.dirname;

function readTrends(relativePath: string): string {
  return readFileSync(join(TRENDS_ROOT, relativePath), 'utf8');
}

describe('trends semantic theme surfaces', () => {
  it.each([
    // Its error states delegate their surface to `@ui/primitives/alert`.
    ['detail/trend-detail.tsx', 'border-white', null],
    ['detail/trend-detail-analysis-card.tsx', 'border-white', 'border-border'],
    // Delegates its border to `@ui/card/Card`.
    [
      'platform-detail/components/related-metric-card.tsx',
      'border-white',
      null,
    ],
    ['list/components/HookRemixModal.tsx', 'bg-white/5', 'bg-foreground/5'],
  ])(
    'removes fixed dark-only chrome from %s',
    (relativePath, forbiddenToken, semanticToken: string | null) => {
      const source = readTrends(relativePath);

      // A `null` semantic token means the file hands the surface to a shared
      // `@ui` primitive, which owns the semantic classes and guards them in
      // its own contract test.
      if (semanticToken !== null) {
        expect(source).toContain(semanticToken);
      }

      expect(source).not.toContain(forbiddenToken);
    },
  );

  it('uses semantic borders in the Desk surfaces while preserving media canvases', () => {
    const sourcesMenu = readTrends('desk/desk-sources-menu.tsx');
    const lightTable = readTrends('desk/desk-light-table-view.tsx');

    expect(sourcesMenu).toContain('border-border');
    expect(sourcesMenu).toContain('divide-border');
    expect(sourcesMenu).not.toContain('border-white');
    expect(sourcesMenu).not.toContain('divide-white');
    expect(lightTable).toContain(
      'aspect-video w-full overflow-hidden bg-black',
    );
  });

  it('uses a semantic checkbox boundary in the follow-source picker', () => {
    const source = readTrends('following/FollowSourceModal.tsx');

    expect(source).toContain('!border-foreground/50');
    expect(source).not.toContain('!border-white');
  });

  it.each([
    'platform-detail/components/related-metric-card.tsx',
    'shared/trend-content-card.tsx',
  ])('uses the shared Card for semantic card surfaces in %s', (path) => {
    const source = readTrends(path);

    expect(source).toContain("import Card from '@ui/card/Card'");
    expect(source).toContain('<Card');
  });
});
