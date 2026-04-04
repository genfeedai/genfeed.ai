import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('useTableSelection.ts', () => {
  it('declares the expected export', () => {
    const source = readFileSync(
      join(
        process.cwd(),
        'packages/pages/studio/generate/hooks/useTableSelection.ts',
      ),
      'utf8',
    );
    expect(source).toContain('export function useTableSelection');
  });
});
