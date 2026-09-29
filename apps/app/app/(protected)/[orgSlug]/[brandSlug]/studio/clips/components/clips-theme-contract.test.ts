import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const CLIPS_CHROME_SOURCES = [
  'app/(protected)/[orgSlug]/[brandSlug]/studio/clips/ClipsWorkspace.tsx',
  'app/(protected)/[orgSlug]/[brandSlug]/studio/clips/components/ClipModeSelector.tsx',
  'app/(protected)/[orgSlug]/[brandSlug]/studio/clips/components/ClipsInputForm.tsx',
  'app/(protected)/[orgSlug]/[brandSlug]/studio/clips/components/ClipsProgressView.tsx',
  'app/(protected)/[orgSlug]/[brandSlug]/studio/clips/components/ClipsProjectCard.tsx',
  'app/(protected)/[orgSlug]/[brandSlug]/studio/clips/page.tsx',
] as const;

describe('Clips theme contract', () => {
  it('owns page chrome through a single Container topbar', () => {
    const source = readFileSync(
      join(process.cwd(), CLIPS_CHROME_SOURCES[0]),
      'utf8',
    );

    expect(source).toContain("from '@ui/layout/container/Container'");
    expect(source).not.toContain('SectionTopbar');
    expect(source).not.toContain('max-w-6xl');
    expect(source).not.toContain('max-w-4xl');
  });
});
