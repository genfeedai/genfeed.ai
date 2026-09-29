import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const PROTECTED_ROOT = join(process.cwd(), 'app/(protected)');

function walkPageFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);

    if (entry.isDirectory()) {
      walkPageFiles(path, out);
      continue;
    }

    if (entry.name === 'page.tsx') {
      out.push(path);
    }
  }

  return out;
}

function toRelativeAppPath(path: string): string {
  return path.replace(`${process.cwd()}/`, '');
}

const protectedPageFiles = walkPageFiles(PROTECTED_ROOT);

describe('protected app route source contracts', () => {
  it('keeps protected pages default-exported', () => {
    expect(protectedPageFiles.length).toBeGreaterThanOrEqual(168);

    const missingDefaultExports = protectedPageFiles
      .filter((path) => {
        const source = readFileSync(path, 'utf8');
        return !/export\s+(?:\{[^}]*default|default\s+)/s.test(source);
      })
      .map(toRelativeAppPath);

    expect(missingDefaultExports).toEqual([]);
  });
});
