import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('discover/socials/page.tsx', () => {
  it('permanently redirects the retired Socials peer into Discover Overview', () => {
    const source = readFileSync(
      join(
        process.cwd(),
        'app/(protected)/[orgSlug]/[brandSlug]/discover/socials/page.tsx',
      ),
      'utf8',
    );

    expect(source).toContain('permanentRedirect');
    expect(source).toContain('DISCOVER.OVERVIEW');
    expect(source).toContain('createBrandAppRoute');
    expect(source).not.toContain('TrendsList');
  });
});
