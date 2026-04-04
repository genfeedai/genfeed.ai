#!/usr/bin/env bun

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

type RuntimeName = 'client' | 'edge' | 'nodejs';

interface RuntimeSummary {
  assetCount: number;
  initialAssetCount: number;
  initialGzipSize: number | null;
  initialParsedSize: number | null;
  initialStatSize: number;
  runtime: RuntimeName;
  totalGzipSize: number | null;
  totalParsedSize: number | null;
  totalStatSize: number;
}

interface AppManifest {
  app: string;
  runtimes: Partial<Record<RuntimeName, RuntimeSummary>>;
}

interface BundleManifest {
  apps: AppManifest[];
  generatedAt: string;
  workspace: string;
}

interface MetricComparison {
  baseBytes: number | null;
  baseLabel: string;
  deltaBytes: number | null;
  deltaPercent: number | null;
  headBytes: number | null;
  headLabel: string;
}

interface BundleComparisonResult {
  app: string;
  client: MetricComparison;
  informational: Partial<Record<'edge' | 'nodejs', MetricComparison>>;
  regressionThresholdPercent: number;
  shouldFail: boolean;
}

interface CliArgs {
  app?: string;
  base: string;
  head: string;
  out: string;
  threshold: number;
}

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
      args.threshold = Number(next);
      index += 1;
      continue;
    }

    if (current === '--app' && next) {
      args.app = next;
      index += 1;
    }
  }

  if (!args.base || !args.head || !args.out) {
    throw new Error(
      'Usage: bun run scripts/compare-bundle-manifests.ts --base <file> --head <file> --out <file> [--app <name>] [--threshold <percent>]',
    );
  }

  return {
    app: args.app,
    base: args.base,
    head: args.head,
    out: args.out,
    threshold: args.threshold ?? 5,
  };
}

function getAppManifest(
  manifest: BundleManifest,
  app: string,
  sourceLabel: 'base' | 'head',
): AppManifest {
  const appManifest = manifest.apps.find((entry) => entry.app === app);

  if (!appManifest) {
    throw new Error(`Could not find app "${app}" in ${sourceLabel} manifest.`);
  }

  return appManifest;
}

function selectClientMetric(summary?: RuntimeSummary): {
  bytes: number | null;
  label: string;
} {
  if (!summary) {
    return { bytes: null, label: 'missing client runtime' };
  }

  if (summary.initialGzipSize !== null) {
    return { bytes: summary.initialGzipSize, label: 'initial gzip' };
  }

  if (summary.initialParsedSize !== null) {
    return { bytes: summary.initialParsedSize, label: 'initial parsed' };
  }

  return { bytes: summary.initialStatSize, label: 'initial stat' };
}

function selectRuntimeMetric(summary?: RuntimeSummary): {
  bytes: number | null;
  label: string;
} {
  if (!summary) {
    return { bytes: null, label: 'runtime not emitted' };
  }

  if (summary.totalGzipSize !== null) {
    return { bytes: summary.totalGzipSize, label: 'total gzip' };
  }

  if (summary.totalParsedSize !== null) {
    return { bytes: summary.totalParsedSize, label: 'total parsed' };
  }

  return { bytes: summary.totalStatSize, label: 'total stat' };
}

function calculateDeltaPercent(
  baseBytes: number | null,
  headBytes: number | null,
): number | null {
  if (baseBytes === null || headBytes === null) {
    return null;
  }

  if (baseBytes === 0) {
    return headBytes === 0 ? 0 : 100;
  }

  return ((headBytes - baseBytes) / baseBytes) * 100;
}

function compareMetric(
  baseMetric: { bytes: number | null; label: string },
  headMetric: { bytes: number | null; label: string },
): MetricComparison {
  const deltaBytes =
    baseMetric.bytes === null || headMetric.bytes === null
      ? null
      : headMetric.bytes - baseMetric.bytes;

  return {
    baseBytes: baseMetric.bytes,
    baseLabel: baseMetric.label,
    deltaBytes,
    deltaPercent: calculateDeltaPercent(baseMetric.bytes, headMetric.bytes),
    headBytes: headMetric.bytes,
    headLabel: headMetric.label,
  };
}

async function readManifest(filePath: string): Promise<BundleManifest> {
  return JSON.parse(await readFile(filePath, 'utf8')) as BundleManifest;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const baseManifest = await readManifest(args.base);
  const headManifest = await readManifest(args.head);
  const appName = args.app ?? headManifest.apps[0]?.app;

  if (!appName) {
    throw new Error('No app was provided and the head manifest is empty.');
  }

  const baseApp = getAppManifest(baseManifest, appName, 'base');
  const headApp = getAppManifest(headManifest, appName, 'head');

  const client = compareMetric(
    selectClientMetric(baseApp.runtimes.client),
    selectClientMetric(headApp.runtimes.client),
  );
  const nodejs = compareMetric(
    selectRuntimeMetric(baseApp.runtimes.nodejs),
    selectRuntimeMetric(headApp.runtimes.nodejs),
  );
  const edge = compareMetric(
    selectRuntimeMetric(baseApp.runtimes.edge),
    selectRuntimeMetric(headApp.runtimes.edge),
  );

  const result: BundleComparisonResult = {
    app: appName,
    client,
    informational: {
      edge,
      nodejs,
    },
    regressionThresholdPercent: args.threshold,
    shouldFail:
      client.deltaPercent !== null && client.deltaPercent > args.threshold,
  };

  await mkdir(path.dirname(args.out), { recursive: true });
  await writeFile(args.out, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
}

await main();
