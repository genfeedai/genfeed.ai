import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const CLIPPER_CHROME_SOURCES = [
  'app/(protected)/[orgSlug]/[brandSlug]/clipper/ClipperWorkspace.tsx',
  'app/(protected)/[orgSlug]/[brandSlug]/clipper/components/ClipperModeSelector.tsx',
  'app/(protected)/[orgSlug]/[brandSlug]/clipper/components/ClipperInputForm.tsx',
  'app/(protected)/[orgSlug]/[brandSlug]/clipper/components/ClipperProgressView.tsx',
  'app/(protected)/[orgSlug]/[brandSlug]/clipper/components/ClipperProjectCard.tsx',
  'app/(protected)/[orgSlug]/[brandSlug]/clipper/page.tsx',
] as const;

describe('Clips theme contract', () => {
  it.each(CLIPPER_CHROME_SOURCES)(
    'uses semantic theme colors for ordinary chrome in %s',
    (relativePath) => {
      const source = readFileSync(join(process.cwd(), relativePath), 'utf8');

      expect(source).not.toMatch(/(?:bg|border|text)-zinc-\d+/);
      expect(source).not.toMatch(
        /(?:bg|border|text)-(?:black|white)(?:\s|["'`/])/,
      );
    },
  );

  it('owns page chrome through a single Container topbar', () => {
    const source = readFileSync(
      join(process.cwd(), CLIPPER_CHROME_SOURCES[0]),
      'utf8',
    );

    expect(source).toContain("from '@ui/layout/container/Container'");
    expect(source).not.toContain('SectionTopbar');
    expect(source).not.toContain('max-w-6xl');
    expect(source).not.toContain('max-w-4xl');
  });

  it('builds the input form on the shared prompt bar, not a card', () => {
    const source = readFileSync(
      join(
        process.cwd(),
        'app/(protected)/[orgSlug]/[brandSlug]/clipper/components/ClipperInputForm.tsx',
      ),
      'utf8',
    );

    expect(source).toContain(
      "from '@ui/prompt-bars/components/shell/PromptBarComposer'",
    );
    expect(source).not.toContain("from '@ui/card/Card'");
    expect(source).not.toContain('max-w-3xl');
  });
});
