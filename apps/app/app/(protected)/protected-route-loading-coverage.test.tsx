import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const appRouterDirs = ['apps/app/app', 'apps/website/app'] as const;
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
  it('keeps product routes free of page-level loading shells', () => {
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

    expect(routeLoadingFiles.sort()).toEqual([...routeLoadingShells].sort());
  });

  it.each(routeLoadingShells)('reuses LazyLoadingFallback in %s', (route) => {
    const source = readFileSync(join(repoRoot, route), 'utf8');

    expect(source).toContain(
      "import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback'",
    );
    expect(source).toContain('return <LazyLoadingFallback variant="grid" />;');
  });

  it('keeps full-page skeletons out of protected Suspense boundaries', () => {
    const protectedRoutes = join(repoRoot, 'apps/app/app/(protected)');
    const violations = collectTsxFiles(protectedRoutes)
      .filter((file) =>
        /fallback=\{<(?:LazyLoadingFallback|SkeletonLoadingFallback)\b/u.test(
          readFileSync(file, 'utf8'),
        ),
      )
      .map((file) => relative(repoRoot, file));

    expect(violations).toEqual([]);
  });

  it('keeps page-level spinner blockers out of product routes and shell', () => {
    const appRoutes = join(repoRoot, 'apps/app/app');
    const protectedShell = join(
      repoRoot,
      'apps/app/packages/components/app-protected-layout.tsx',
    );
    const violations = [...collectTsxFiles(appRoutes), protectedShell]
      .filter((file) =>
        /(?:from\s+|import\()['"]@ui\/loading\/page\//u.test(
          readFileSync(file, 'utf8'),
        ),
      )
      .map((file) => relative(repoRoot, file));

    expect(violations).toEqual([]);
  });
});
