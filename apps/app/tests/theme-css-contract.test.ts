import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Tailwind theme selector contract', () => {
  it('binds dark variants to the data-theme attribute used by next-themes', () => {
    const source = readFileSync(
      join(process.cwd(), '../../packages/styles/globals.css'),
      'utf8',
    );

    expect(source).toContain(
      '@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));',
    );
  });
});
