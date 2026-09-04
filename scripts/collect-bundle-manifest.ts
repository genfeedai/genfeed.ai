#!/usr/bin/env bun

/**
 * Per-route first-load JavaScript collector.
 *
 * Reads a finished `next build` output directory and reports, for every App
 * Router route, the gzipped size of the JavaScript a browser must download
 * before that route becomes interactive. That is the number a reviewer needs
 * when a pull request statically imports a heavy library onto a hot route.
 *
 * It reads Next's own manifest rather than an analyzer plugin report: every
 * Next app here builds with `--turbopack`, and the webpack-only
 * `@next/bundle-analyzer` is gone. Next.js 16 removed the
 * standalone `app-build-manifest.json` and folded App Router entries into
 * `build-manifest.json`'s `pages` map (both bundlers write that file), so
 * this reads `build-manifest.json` alone and keeps only the `/page` and
 * `/route` entries — the Pages Router keys (`/_app`, `/_error`, ...) sort
 * before them and are filtered out the same way app-build-manifest.json's
 * entries used to be.
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

interface BuildManifest {
  pages: Record<string, string[]>;
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

  const buildManifest = await readJson<BuildManifest>(
    path.join(args.dist, 'build-manifest.json'),
  );

  if (!buildManifest) {
    throw new Error(
      `No build-manifest.json under ${args.dist}. Run \`next build\` first.`,
    );
  }

  const shared = [
    ...(buildManifest.rootMainFiles ?? []),
    ...(buildManifest.polyfillFiles ?? []),
  ];
  const sharedGzipBytes = await sumGzip(args.dist, shared);

  const routes: RouteSummary[] = [];

  for (const [entry, chunks] of Object.entries(buildManifest.pages)) {
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
