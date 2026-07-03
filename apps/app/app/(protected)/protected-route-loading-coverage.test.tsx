import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const appRouterDirs = ['apps/app/app', 'apps/website/app'] as const;

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

describe('protected route loading coverage', () => {
  it('keeps app-router pages content-first instead of route-skeleton-first', () => {
    const routeLoadingFiles = appRouterDirs.flatMap((appRouterDir) => {
      const absoluteAppRouterDir = join(repoRoot, appRouterDir);

      if (!existsSync(absoluteAppRouterDir)) {
        return [];
      }

      return collectRouteLoadingFiles(
        absoluteAppRouterDir,
        absoluteAppRouterDir,
      ).map((route) => join(appRouterDir, route));
    });

    expect(routeLoadingFiles).toEqual([]);
  });
});
