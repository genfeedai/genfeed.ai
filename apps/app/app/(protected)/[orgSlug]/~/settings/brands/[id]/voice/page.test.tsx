import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('apps/app/app/(protected)/[orgSlug]/~/settings/brands/[id]/voice/page.tsx', () => {
  it('keeps an exported contract in place', () => {
    const source = readFileSync(
      join(
        process.cwd(),
        'apps/app/app/(protected)/[orgSlug]/~/settings/brands/[id]/voice/page.tsx',
      ),
      'utf8',
    );
    expect(source).toContain('export ');
  });
});
