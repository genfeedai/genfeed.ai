import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const CLIPS_CHROME_SOURCES = [
  'app/(protected)/[orgSlug]/[brandSlug]/studio/clips/components/ClipModeSelector.tsx',
  'app/(protected)/[orgSlug]/[brandSlug]/studio/clips/components/ClipsInputForm.tsx',
  'app/(protected)/[orgSlug]/[brandSlug]/studio/clips/components/ClipsProgressView.tsx',
  'app/(protected)/[orgSlug]/[brandSlug]/studio/clips/page.tsx',
] as const;

describe('Clips theme contract', () => {
  it.each(CLIPS_CHROME_SOURCES)(
    'uses semantic theme colors for ordinary chrome in %s',
    (relativePath) => {
      const source = readFileSync(join(process.cwd(), relativePath), 'utf8');

      expect(source).not.toMatch(/(?:bg|border|text)-zinc-\d+/);
      expect(source).not.toMatch(
        /(?:bg|border|text)-(?:black|white)(?:\s|["'`/])/,
      );
    },
  );
});
