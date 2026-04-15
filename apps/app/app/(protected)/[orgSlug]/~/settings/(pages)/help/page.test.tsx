import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('app/(protected)/[orgSlug]/~/settings/(pages)/help/page.tsx', () => {
  it('keeps an exported contract in place', () => {
    const source = readFileSync(
      join(
        process.cwd(),
        'app/(protected)/[orgSlug]/~/settings/(pages)/help/page.tsx',
      ),
      'utf8',
    );
    expect(source).toContain('export ');
  });
});
