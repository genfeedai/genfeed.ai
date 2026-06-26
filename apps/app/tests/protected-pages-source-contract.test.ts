import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const PROTECTED_ROOT = join(process.cwd(), 'app/(protected)');
const BRAND_ROOT_SEGMENT = 'app/(protected)/[orgSlug]/[brandSlug]';

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

function hasNearbyPageTest(path: string): boolean {
  return readdirSync(dirname(path)).some((name) =>
    /(?:^page|page|-page)\.(?:test|spec)\.tsx$/.test(name),
  );
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

  // TODO: add page.test.tsx files for the entries below — they were shipped
  // without nearby tests after the contract was introduced. Remove each path
  // from this set once a sibling page test exists for it.
  const KNOWN_MISSING_PAGE_TESTS = new Set([
    'app/(protected)/[orgSlug]/[brandSlug]/library/moodboard/page.tsx',
    'app/(protected)/[orgSlug]/[brandSlug]/studio/fastlane/page.tsx',
  ]);

  it('keeps every brand-scoped protected page covered by a nearby page test', () => {
    const missingNearbyTests = protectedPageFiles
      .filter((path) => toRelativeAppPath(path).startsWith(BRAND_ROOT_SEGMENT))
      .filter((path) => !hasNearbyPageTest(path))
      .map(toRelativeAppPath)
      .filter((relPath) => !KNOWN_MISSING_PAGE_TESTS.has(relPath));

    expect(missingNearbyTests).toEqual([]);
  });
});
