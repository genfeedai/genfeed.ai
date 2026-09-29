import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const routeLoadingShells = ['apps/website/app/(content)/loading.tsx'] as const;

function findRepoRoot(startDirectory: string): string {
  let currentDirectory = startDirectory;

  while (currentDirectory !== dirname(currentDirectory)) {
    if (existsSync(join(currentDirectory, 'apps/app/app'))) {
      return currentDirectory;
    }

    currentDirectory = dirname(currentDirectory);
  }

  throw new Error(`Unable to find repo root from ${startDirectory}`);
}

const repoRoot = findRepoRoot(process.cwd());

function collectRouteLoadingFiles(
  directory: string,
  appRouterDir: string,
): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      return collectRouteLoadingFiles(entryPath, appRouterDir);
    }

    if (entry.name !== 'loading.tsx') {
      return [];
    }

    return relative(appRouterDir, entryPath);
  });
}

function collectTsxFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      return collectTsxFiles(entryPath);
    }

    return entry.name.endsWith('.tsx') ? [entryPath] : [];
  });
}

describe('route loading shell coverage', () => {
  it.each(routeLoadingShells)('reuses LazyLoadingFallback in %s', (route) => {
    const source = readFileSync(join(repoRoot, route), 'utf8');

    expect(source).toContain(
      "import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback'",
    );
    expect(source).toContain('return <LazyLoadingFallback variant="grid" />;');
  });
});
