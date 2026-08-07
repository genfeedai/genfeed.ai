import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('publish/page.tsx', () => {
  it('permanently redirects bare /publish to the overview home', () => {
    const source = readFileSync(
      join(
        process.cwd(),
        'app/(protected)/[orgSlug]/[brandSlug]/publish/page.tsx',
      ),
      'utf8',
    );

    expect(source).toContain('redirect');
    expect(source).toContain('PUBLISH.OVERVIEW');
  });
});
