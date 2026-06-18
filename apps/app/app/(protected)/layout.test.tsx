import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('app/(protected)/layout.tsx', () => {
  it('keeps an exported contract in place', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/(protected)/layout.tsx'),
      'utf8',
    );
    expect(source).toContain('export ');
  });

  it('does not block the protected shell on the server bootstrap payload', () => {
    const source = readFileSync(
      join(process.cwd(), 'app/(protected)/layout.tsx'),
      'utf8',
    );

    expect(source).not.toContain('loadProtectedBootstrap');
    expect(source).toContain('initialBootstrap={null}');
  });
});
