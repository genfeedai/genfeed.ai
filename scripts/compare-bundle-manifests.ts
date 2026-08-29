#!/usr/bin/env bun

/**
 * Renders the per-route first-load JavaScript delta between two manifests
 * produced by `scripts/collect-bundle-manifest.ts` as a Markdown table, for
 * posting on a pull request.
 *
 * Reports only routes that moved, plus every route the branch adds or removes,
 * so an unchanged pull request produces one line instead of a wall of zeroes.
 *
 * Usage:
 *     bun run scripts/compare-bundle-manifests.ts \
 *       --base bundle-base.json --head bundle-head.json --out report.md
 *
 * `--base` may be omitted when no baseline exists yet; the report then lists
 * absolute sizes for the heaviest routes.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

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

interface RouteComparison {
  baseBytes: number | null;
  deltaBytes: number | null;
  headBytes: number | null;
  route: string;
}

interface CliArgs {
  base?: string;
  head: string;
  out: string;
  threshold: number;
}

/** Below this, a delta is bundler chunk-hash noise rather than a real change. */
const DEFAULT_THRESHOLD_BYTES = 512;
const TOP_ROUTE_COUNT = 15;

function parseArgs(argv: string[]): CliArgs {
  const args: Partial<CliArgs> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    if (current === '--base' && next) {
      args.base = next;
      index += 1;
      continue;
    }

    if (current === '--head' && next) {
      args.head = next;
      index += 1;
      continue;
    }

    if (current === '--out' && next) {
      args.out = next;
      index += 1;
      continue;
    }

    if (current === '--threshold' && next) {
      args.threshold = Number.parseInt(next, 10);
      index += 1;
    }
  }

  if (!args.head) {
    throw new Error('Missing required argument: --head <path>');
  }

  if (!args.out) {
    throw new Error('Missing required argument: --out <path>');
  }

  return {
    base: args.base,
    head: args.head,
    out: args.out,
    threshold: Number.isFinite(args.threshold)
      ? (args.threshold as number)
      : DEFAULT_THRESHOLD_BYTES,
  };
}

async function readManifest(
  filePath: string | undefined,
): Promise<BundleManifest | null> {
  if (!filePath) {
    return null;
  }

  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as BundleManifest;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) {
    return '—';
  }

  return `${(bytes / 1024).toFixed(1)} kB`;
}

function formatDelta(bytes: number | null): string {
  if (bytes === null) {
    return '—';
  }

  if (bytes === 0) {
    return '0';
  }

  const sign = bytes > 0 ? '+' : '−';
  return `${sign}${(Math.abs(bytes) / 1024).toFixed(1)} kB`;
}

function compare(
  base: BundleManifest | null,
  head: BundleManifest,
): RouteComparison[] {
  const baseByRoute = new Map(
    (base?.routes ?? []).map((route) => [
      route.route,
      route.firstLoadGzipBytes,
    ]),
  );
  const headByRoute = new Map(
    head.routes.map((route) => [route.route, route.firstLoadGzipBytes]),
  );

  const routes = [...new Set([...baseByRoute.keys(), ...headByRoute.keys()])];

  return routes
    .map((route) => {
      const baseBytes = baseByRoute.get(route) ?? null;
      const headBytes = headByRoute.get(route) ?? null;

      return {
        baseBytes,
        deltaBytes:
          baseBytes === null || headBytes === null
            ? null
            : headBytes - baseBytes,
        headBytes,
        route,
      };
    })
    .sort(
      (left, right) =>
        Math.abs(right.deltaBytes ?? Number.POSITIVE_INFINITY) -
        Math.abs(left.deltaBytes ?? Number.POSITIVE_INFINITY),
    );
}

function renderTable(rows: RouteComparison[]): string[] {
  return [
    '| Route | Base | Head | Δ first-load JS (gzip) |',
    '| --- | ---: | ---: | ---: |',
    ...rows.map(
      (row) =>
        `| \`${row.route}\` | ${formatBytes(row.baseBytes)} | ${formatBytes(row.headBytes)} | ${formatDelta(row.deltaBytes)} |`,
    ),
  ];
}

function renderBaseline(head: BundleManifest): string[] {
  const heaviest = [...head.routes]
    .sort((left, right) => right.firstLoadGzipBytes - left.firstLoadGzipBytes)
    .slice(0, TOP_ROUTE_COUNT);

  return [
    `No baseline manifest for \`${head.app}\`, so this run reports absolute sizes only.`,
    '',
    `Shared by every route: ${formatBytes(head.sharedGzipBytes)}`,
    '',
    '| Route | First-load JS (gzip) |',
    '| --- | ---: |',
    ...heaviest.map(
      (route) =>
        `| \`${route.route}\` | ${formatBytes(route.firstLoadGzipBytes)} |`,
    ),
  ];
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const head = await readManifest(args.head);
  if (!head) {
    throw new Error(`No head manifest at ${args.head}`);
  }

  const base = await readManifest(args.base);
  const lines = [`### First-load JavaScript — \`${head.app}\``, ''];

  if (!base) {
    lines.push(...renderBaseline(head));
  } else {
    const moved = compare(base, head).filter(
      (row) =>
        row.deltaBytes === null || Math.abs(row.deltaBytes) >= args.threshold,
    );

    if (!moved.length) {
      lines.push(
        `No route moved by more than ${formatBytes(args.threshold)}. Shared chunks: ${formatBytes(head.sharedGzipBytes)}.`,
      );
    } else {
      lines.push(
        `Shared by every route: ${formatBytes(base.sharedGzipBytes)} → ${formatBytes(head.sharedGzipBytes)}`,
        '',
        ...renderTable(moved.slice(0, TOP_ROUTE_COUNT)),
      );

      if (moved.length > TOP_ROUTE_COUNT) {
        lines.push(
          '',
          `${moved.length - TOP_ROUTE_COUNT} further routes moved by at least ${formatBytes(args.threshold)}.`,
        );
      }
    }
  }

  await mkdir(path.dirname(args.out), { recursive: true });
  await writeFile(args.out, `${lines.join('\n')}\n`, 'utf8');
}

await main();
