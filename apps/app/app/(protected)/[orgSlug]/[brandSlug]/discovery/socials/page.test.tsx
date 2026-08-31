import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('discovery/socials/page.tsx', () => {
  it('permanently redirects the retired Socials peer into Discovery Overview', () => {
    const source = readFileSync(
      join(
        process.cwd(),
        'app/(protected)/[orgSlug]/[brandSlug]/discovery/socials/page.tsx',
      ),
      'utf8',
    );

    expect(source).toContain('permanentRedirect');
    expect(source).toContain('DISCOVERY.OVERVIEW');
    expect(source).toContain('createBrandAppRoute');
    expect(source).not.toMatch(/import\s+TrendsList/);
  });
});
