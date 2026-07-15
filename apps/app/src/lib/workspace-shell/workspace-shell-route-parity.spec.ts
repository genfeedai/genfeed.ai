import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PROTECTED_ROUTE_INVENTORY } from './workspace-shell-registry';

const PROTECTED_APP_DIRECTORY = 'apps/app/app/(protected)';
const INTENTIONAL_HARD_CUT_PREFIXES = [
  '/:orgSlug/~/settings/organization',
] as const;

function findRepoRoot(startDirectory: string): string {
  let currentDirectory = startDirectory;

  while (currentDirectory !== dirname(currentDirectory)) {
    if (existsSync(join(currentDirectory, PROTECTED_APP_DIRECTORY))) {
      return currentDirectory;
    }

    currentDirectory = dirname(currentDirectory);
  }

  throw new Error(`Unable to find repo root from ${startDirectory}`);
}

function collectPageFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      return collectPageFiles(entryPath);
    }

    return entry.name === 'page.tsx' ? [entryPath] : [];
  });
}

function toCanonicalPattern(appDirectory: string, pageFile: string): string {
  const segments = relative(appDirectory, dirname(pageFile))
    .split('/')
    .filter((segment) => !/^\(.+\)$/.test(segment))
    .map((segment) => {
      const dynamicSegment = segment.match(/^\[([^.[\]]+)\]$/);
      return dynamicSegment ? `:${dynamicSegment[1]}` : segment;
    });

  return segments.length === 0 ? '/' : `/${segments.join('/')}`;
}

function isIntentionalHardCut(pattern: string): boolean {
  return (
    pattern.includes('[[...segments]]') ||
    INTENTIONAL_HARD_CUT_PREFIXES.some(
      (prefix) => pattern === prefix || pattern.startsWith(`${prefix}/`),
    )
  );
}

describe('workspace shell protected-route parity', () => {
  it('requires every conventional protected page to have an explicit shell contract', () => {
    const repoRoot = findRepoRoot(process.cwd());
    const appDirectory = join(repoRoot, PROTECTED_APP_DIRECTORY);
    const registeredPatterns = new Set(
      PROTECTED_ROUTE_INVENTORY.map((route) => route.canonicalUrl),
    );
    const discoveredPatterns = new Set(
      collectPageFiles(appDirectory)
        .map((pageFile) => toCanonicalPattern(appDirectory, pageFile))
        .filter((pattern) => !isIntentionalHardCut(pattern)),
    );
    const missingRegistrations = [...discoveredPatterns]
      .filter((pattern) => !registeredPatterns.has(pattern))
      .sort();

    expect(missingRegistrations).toEqual([]);
  });
});
