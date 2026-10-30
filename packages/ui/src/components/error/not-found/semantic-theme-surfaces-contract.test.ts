import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('not-found semantic theme surfaces', () => {
  it('themes the not-found application surface', () => {
    const source = readFileSync(
      join(import.meta.dirname, 'not-found-page.tsx'),
      'utf8',
    );

    expect(source).toContain('bg-background');
    expect(source).toContain('bg-primary');
    expect(source).toContain('text-primary-foreground');
    expect(source).not.toContain('bg-black');
    expect(source).not.toContain('bg-white');
    expect(source).not.toContain('text-black');
  });
});
