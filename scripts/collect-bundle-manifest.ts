#!/usr/bin/env bun

/**
 * Per-route first-load JavaScript collector.
 *
 * Reads a finished `next build` output directory and reports, for every App
 * Router route, the gzipped size of the JavaScript a browser must download
 * before that route becomes interactive. That is the number a reviewer needs
 * when a pull request statically imports a heavy library onto a hot route.
 *
 * Every Next app here builds with `--turbopack`. Under Next 16 + Turbopack,
 * `build-manifest.json` no longer lists App Router routes (its `pages` map
 * holds only the Pages Router keys), so reading it alone produced
 * `routes: []` and a "no route moved" report on every pull request. The
 * per-route source of truth is each page's
 * `server/app/<route>/page_client-reference-manifest.js`: its `entryJSFiles`
 * map lists the client chunks of every segment the page renders — the root
 * and group layouts, `loading`, the page itself, and the root `not-found` and
 * `global-error` boundaries Next preloads on every page. A route's first load
 * is the union of those chunks with `rootMainFiles`.
 *
 * `polyfillFiles` are left out: they ship as `nomodule`, so modern browsers
 * never download them. (Verified against a production build in a real
 * browser: every chunk counted here was requested on first load, and the
 * polyfills were not.)
 *
 * When a build has no client-reference manifests (a webpack build), the
 * collector falls back to `build-manifest.json`'s `/page` entries.
 *
 * Usage:
 *     bun run scripts/collect-bundle-manifest.ts \
 *       --app app --dist apps/app/.next --out bundle-head.json
 */

import type { Dirent } from 'node:fs';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
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

/**
 * `/dashboard/page` and `/dashboard/route` both address the route
 * `/dashboard`; route groups such as `/(public)` never appear in the URL.
 */
export function toRoute(entry: string): string {
  const route = entry
    .replace(/\/(page|route)$/, '')
    .replace(/\/\([^/)]+\)/g, '');
  return route === '' ? '/' : route;
}

interface ClientReferenceManifest {
  entryJSFiles?: Record<string, string[]>;
}

const CLIENT_MANIFEST_FILE = 'page_client-reference-manifest.js';

/**
 * Parse one `page_client-reference-manifest.js`. The file is a script that
 * assigns a JSON object: `globalThis.__RSC_MANIFEST["/about/page"] = {...};`.
 */
export function parseClientReferenceManifest(
  source: string,
): { chunks: string[]; entry: string } | null {
  const key = source.match(/__RSC_MANIFEST\["([^"]+)"\]\s*=\s*/);
  if (!key || key.index === undefined) {
    return null;
  }

  const body = source
    .slice(key.index + key[0].length)
    .trim()
    .replace(/;$/, '');
  const manifest = JSON.parse(body) as ClientReferenceManifest;
  const chunks = Object.values(manifest.entryJSFiles ?? {}).flat();

  return { chunks: [...new Set(chunks)], entry: key[1] };
}

async function findClientManifests(directory: string): Promise<string[]> {
  let entries: Dirent[];

  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }

    throw error;
  }

  const found: string[] = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      found.push(...(await findClientManifests(entryPath)));
    } else if (entry.name === CLIENT_MANIFEST_FILE) {
      found.push(entryPath);
    }
  }

  return found;
}

/** Route → that route's own client chunks (shared chunks are added later). */
async function collectRouteChunks(
  dist: string,
  buildManifest: BuildManifest,
): Promise<Map<string, string[]>> {
  const routeChunks = new Map<string, string[]>();

  for (const file of await findClientManifests(
    path.join(dist, 'server', 'app'),
  )) {
    const parsed = parseClientReferenceManifest(await readFile(file, 'utf8'));
    if (parsed) {
      routeChunks.set(toRoute(parsed.entry), parsed.chunks);
    }
  }

  if (routeChunks.size > 0) {
    return routeChunks;
  }

  for (const [entry, chunks] of Object.entries(buildManifest.pages)) {
    if (entry.endsWith('/page') || entry.endsWith('/route')) {
      routeChunks.set(toRoute(entry), chunks);
    }
  }

  return routeChunks;
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

  const shared = [...(buildManifest.rootMainFiles ?? [])];
  const sharedGzipBytes = await sumGzip(args.dist, shared);

  const routes: RouteSummary[] = [];

  for (const [route, chunks] of await collectRouteChunks(
    args.dist,
    buildManifest,
  )) {
    const unique = [...new Set([...shared, ...chunks])];

    routes.push({
      chunkCount: unique.length,
      firstLoadGzipBytes: await sumGzip(args.dist, unique),
      route,
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

if (import.meta.main) {
  await main();
}
