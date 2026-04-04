import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('apps/web/app/app/not-found.tsx', () => {
  it('keeps an exported contract in place', () => {
    const source = readFileSync(
      join(process.cwd(), 'apps/web/app/app/not-found.tsx'),
      'utf8',
    );
    expect(source).toContain('export ');
  });
});
