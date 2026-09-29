import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertSourceHasExport } from '@shared/pages/sourceContractTestUtils';
import { describe, expect, it } from 'vitest';

assertSourceHasExport(
  'app/(protected)/[orgSlug]/[brandSlug]/messages/replies/page.tsx',
);

describe('messages/replies/replies-page.tsx', () => {
  it('detects YouTube with the shared platform helper', () => {
    const source = readFileSync(
      join(
        process.cwd(),
        'app/(protected)/[orgSlug]/[brandSlug]/messages/replies/replies-page.tsx',
      ),
      'utf8',
    );

    expect(source).toContain('isYouTubePlatform');
    expect(source).toContain('parsePlatform');
    expect(source).toContain('formatPlatformLabel');
    expect(source).not.toContain("=== 'YOUTUBE'");
    expect(source).not.toContain("=== 'youtube'");
  });
});
