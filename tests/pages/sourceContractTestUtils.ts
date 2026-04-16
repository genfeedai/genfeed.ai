import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

export function assertSourceHasExport(relativePath: string) {
  describe(relativePath, () => {
    it('keeps an exported contract in place', () => {
      const source = readFileSync(join(process.cwd(), relativePath), 'utf8');

      expect(source).toContain('export ');
    });
  });
}
