import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('publishing/page.tsx', () => {
  it('permanently redirects bare /publishing to the overview home', () => {
    const source = readFileSync(
      join(
        process.cwd(),
        'app/(protected)/[orgSlug]/[brandSlug]/publishing/page.tsx',
      ),
      'utf8',
    );

    expect(source).toContain('redirect');
    expect(source).toContain('PUBLISHING.OVERVIEW');
  });
});
