import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('app/(protected)/loading.tsx', () => {
  it('keeps an exported contract in place', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/(protected)/loading.tsx'),
      'utf8',
    );
    expect(source).toContain('export ');
  });
});
