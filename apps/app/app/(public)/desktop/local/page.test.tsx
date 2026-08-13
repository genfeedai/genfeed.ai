import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('app/(public)/desktop/local/page.tsx', () => {
  it('wraps colocated client content in a Suspense boundary', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/(public)/desktop/local/page.tsx'),
      'utf8',
    );

    expect(source).toContain("import { Suspense } from 'react'");
    expect(source).toMatch(
      /<Suspense fallback=\{null\}>\s*<LocalDesktopContent \/>\s*<\/Suspense>/,
    );
  });
});
