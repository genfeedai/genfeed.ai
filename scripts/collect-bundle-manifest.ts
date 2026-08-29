#!/usr/bin/env bun

/**
 * Per-route first-load JavaScript collector.
 *
 * Reads a finished `next build` output directory and reports, for every App
 * Router route, the gzipped size of the JavaScript a browser must download
 * before that route becomes interactive. That is the number a reviewer needs
 * when a pull request statically imports a heavy library onto a hot route.
 *
 * It reads Next's own manifests rather than an analyzer plugin report:
 * `@next/bundle-analyzer` is a webpack plugin, and `apps/app` builds with
 * `--turbopack`, so the plugin never runs there. `app-build-manifest.json` and
 * `build-manifest.json` are emitted by both bundlers.
 *
 * First-load for a route is the union of that route's own chunks with the
 * chunks every route pays for (`rootMainFiles` plus `polyfillFiles`), matching
 * how Next's build summary attributes shared chunks.
 *
 * Usage:
 *     bun run scripts/collect-bundle-manifest.ts \
 *       --app app --dist apps/app/.next --out bundle-head.json
 */

import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

interface AppBuildManifest {
  pages: Record<string, string[]>;
}

interface BuildManifest {
  polyfillFiles?: string[];
  rootMainFiles?: string[];
}

interface RouteSummary {
  chunkCount: number;
  firstLoadGzipBytes: number;
  route: string;
}

interface BundleManifest {
  app: string;
  generatedAt: string;
  routes: RouteSummary[];
  sharedGzipBytes: number;
}

interface CliArgs {
  app: string;
  dist: string;
  out: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: Partial<CliArgs> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    if (current === '--app' && next) {
      args.app = next;
      index += 1;
      continue;
    }

    if (current === '--dist' && next) {
      args.dist = next;
      index += 1;
      continue;
    }

    if (current === '--out' && next) {
      args.out = next;
      index += 1;
    }
  }

  if (!args.app) {
    throw new Error('Missing required argument: --app <name>');
  }

  if (!args.dist) {
    throw new Error('Missing required argument: --dist <path>');
  }

  if (!args.out) {
    throw new Error('Missing required argument: --out <path>');
  }

  return { app: args.app, dist: args.dist, out: args.out };
}

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

/**
 * Gzipped size is what crosses the wire. Cached per chunk because shared
 * chunks appear in most routes and gzipping the framework bundle repeatedly
 * dominates the runtime otherwise.
 */
const gzipCache = new Map<string, number>();

async function gzipBytes(dist: string, chunk: string): Promise<number> {
  const cached = gzipCache.get(chunk);
  if (cached !== undefined) {
    return cached;
  }

  const chunkPath = path.join(dist, chunk);
  let size = 0;

  try {
    const info = await stat(chunkPath);
    if (info.isFile()) {
      size = gzipSync(await readFile(chunkPath)).byteLength;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }

  gzipCache.set(chunk, size);
  return size;
}

async function sumGzip(dist: string, chunks: string[]): Promise<number> {
  const sizes = await Promise.all(
    chunks.map((chunk) => gzipBytes(dist, chunk)),
  );

  return sizes.reduce((total, size) => total + size, 0);
}

/** `/dashboard/page` and `/dashboard/route` both address the route `/dashboard`. */
function toRoute(entry: string): string {
  const route = entry.replace(/\/(page|route)$/, '');
  return route === '' ? '/' : route;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const appManifest = await readJson<AppBuildManifest>(
    path.join(args.dist, 'app-build-manifest.json'),
  );

  if (!appManifest) {
    throw new Error(
      `No app-build-manifest.json under ${args.dist}. Run \`next build\` first.`,
    );
  }

  const buildManifest =
    (await readJson<BuildManifest>(
      path.join(args.dist, 'build-manifest.json'),
    )) ?? {};

  const shared = [
    ...(buildManifest.rootMainFiles ?? []),
    ...(buildManifest.polyfillFiles ?? []),
  ];
  const sharedGzipBytes = await sumGzip(args.dist, shared);

  const routes: RouteSummary[] = [];

  for (const [entry, chunks] of Object.entries(appManifest.pages)) {
    if (!entry.endsWith('/page') && !entry.endsWith('/route')) {
      continue;
    }

    const unique = [...new Set([...shared, ...chunks])];

    routes.push({
      chunkCount: unique.length,
      firstLoadGzipBytes: await sumGzip(args.dist, unique),
      route: toRoute(entry),
    });
  }

  routes.sort((left, right) => left.route.localeCompare(right.route));

  const manifest: BundleManifest = {
    app: args.app,
    generatedAt: new Date().toISOString(),
    routes,
    sharedGzipBytes,
  };

  await mkdir(path.dirname(args.out), { recursive: true });
  await writeFile(args.out, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

await main();
