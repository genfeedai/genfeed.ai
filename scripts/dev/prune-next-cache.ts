import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';

// Turbopack's dev filesystem cache is on by default in Next 16
// (`turbopackFileSystemCacheForDev: true`). It writes append-only .sst segments
// under .next/dev/cache/turbopack/<version>-<hash>/ and never garbage-collects:
// every route compiled and every edit adds segments, and a Next upgrade or a
// changed define map starts a brand new generation beside the old one. On this
// monorepo that reached 13 GB and left the machine with no room to swap. The
// cache is pure derived state — dropping it costs one cold compile.

export const DEFAULT_MAX_CACHE_GIGABYTES = 4;
const BYTES_PER_GIGABYTE = 1024 ** 3;

export interface INextCacheGeneration {
  modifiedAtMs: number;
  path: string;
}

export interface IPruneDecision {
  isOverBudget: boolean;
  staleGenerations: readonly string[];
}

export function formatGigabytes(bytes: number): string {
  return `${(bytes / BYTES_PER_GIGABYTE).toFixed(2)} GB`;
}

/**
 * Every generation except the most recently written one is unreachable — Next
 * only ever opens the directory matching its own version and config hash.
 */
export function selectStaleGenerations(
  generations: readonly INextCacheGeneration[],
): readonly string[] {
  if (generations.length <= 1) {
    return [];
  }

  const newest = generations.reduce((latest, candidate) =>
    candidate.modifiedAtMs > latest.modifiedAtMs ? candidate : latest,
  );

  return generations
    .filter((generation) => generation.path !== newest.path)
    .map((generation) => generation.path);
}

export function planPrune(
  generations: readonly INextCacheGeneration[],
  totalBytes: number,
  maxGigabytes: number,
): IPruneDecision {
  return {
    isOverBudget: totalBytes > maxGigabytes * BYTES_PER_GIGABYTE,
    staleGenerations: selectStaleGenerations(generations),
  };
}

function directorySizeInBytes(directory: string): number {
  let total = 0;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      total += directorySizeInBytes(entryPath);
    } else if (entry.isFile()) {
      total += statSync(entryPath).size;
    }
  }
  return total;
}

function readGenerations(turbopackDir: string): INextCacheGeneration[] {
  if (!existsSync(turbopackDir)) {
    return [];
  }

  return readdirSync(turbopackDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const generationPath = path.join(turbopackDir, entry.name);
      return {
        modifiedAtMs: statSync(generationPath).mtimeMs,
        path: generationPath,
      };
    });
}

export function pruneNextCache(
  appDirectory: string,
  maxGigabytes: number = DEFAULT_MAX_CACHE_GIGABYTES,
  isDryRun = false,
): number {
  const cacheDir = path.join(appDirectory, '.next', 'dev', 'cache');
  if (!existsSync(cacheDir)) {
    return 0;
  }

  const totalBytes = directorySizeInBytes(cacheDir);
  const generations = readGenerations(path.join(cacheDir, 'turbopack'));
  const { isOverBudget, staleGenerations } = planPrune(
    generations,
    totalBytes,
    maxGigabytes,
  );

  const label = path.basename(appDirectory);
  const verb = isDryRun ? 'would remove' : 'removing';
  if (isOverBudget) {
    console.log(
      `${label}: dev cache is ${formatGigabytes(totalBytes)} (budget ${maxGigabytes} GB) — ${verb} all of it`,
    );
    if (!isDryRun) {
      rmSync(cacheDir, { force: true, recursive: true });
    }
    return totalBytes;
  }

  let reclaimed = 0;
  for (const generation of staleGenerations) {
    const size = directorySizeInBytes(generation);
    reclaimed += size;
    console.log(
      `${label}: ${verb} stale generation ${path.basename(generation)} (${formatGigabytes(size)})`,
    );
    if (!isDryRun) {
      rmSync(generation, { force: true, recursive: true });
    }
  }

  if (reclaimed === 0) {
    console.log(
      `${label}: dev cache is ${formatGigabytes(totalBytes)} — nothing to prune`,
    );
  }

  return reclaimed;
}

function findAppDirectories(appsRoot: string): string[] {
  if (!existsSync(appsRoot)) {
    return [];
  }

  return readdirSync(appsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(appsRoot, entry.name))
    .filter((directory) => existsSync(path.join(directory, '.next')));
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const maxArg = args.find((arg) => arg.startsWith('--max-gb='));
  const maxGigabytes = maxArg
    ? Number(maxArg.split('=')[1])
    : DEFAULT_MAX_CACHE_GIGABYTES;

  if (!Number.isFinite(maxGigabytes) || maxGigabytes <= 0) {
    throw new Error(`--max-gb must be a positive number, received ${maxArg}`);
  }

  const repoRoot = path.resolve(import.meta.dir, '..', '..');
  const appDirectories = findAppDirectories(path.join(repoRoot, 'apps'));

  let reclaimed = 0;
  for (const appDirectory of appDirectories) {
    reclaimed += pruneNextCache(appDirectory, maxGigabytes, isDryRun);
  }

  console.log(
    `${isDryRun ? 'Would reclaim' : 'Reclaimed'} ${formatGigabytes(reclaimed)}`,
  );
}
