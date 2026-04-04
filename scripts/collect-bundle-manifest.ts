#!/usr/bin/env bun

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const KNOWN_APPS = [
  'admin',
  'app',
  'chatgpt',
  'marketplace',
  'website',
] as const;
const RUNTIMES = ['client', 'nodejs', 'edge'] as const;

type AppName = (typeof KNOWN_APPS)[number];
type RuntimeName = (typeof RUNTIMES)[number];

interface AnalyzerAsset {
  gzipSize?: number;
  isInitialByEntrypoint?: Record<string, boolean>;
  label: string;
  parsedSize?: number;
  statSize: number;
}

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
  app: AppName;
  runtimes: Partial<Record<RuntimeName, RuntimeSummary>>;
}

interface BundleManifest {
  apps: AppManifest[];
  generatedAt: string;
  workspace: string;
}

interface CliArgs {
  apps: AppName[];
  out: string;
  workspace: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: Partial<CliArgs> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    if (current === '--workspace' && next) {
      args.workspace = next;
      index += 1;
      continue;
    }

    if (current === '--out' && next) {
      args.out = next;
      index += 1;
      continue;
    }

    if (current === '--apps' && next) {
      args.apps = next
        .split(',')
        .map((value) => value.trim())
        .filter((value): value is AppName =>
          KNOWN_APPS.includes(value as AppName),
        );
      index += 1;
    }
  }

  if (!args.workspace) {
    throw new Error('Missing required argument: --workspace <path>');
  }

  if (!args.out) {
    throw new Error('Missing required argument: --out <path>');
  }

  return {
    apps: args.apps?.length ? args.apps : [...KNOWN_APPS],
    out: args.out,
    workspace: args.workspace,
  };
}

function isInitialAsset(asset: AnalyzerAsset): boolean {
  return Object.values(asset.isInitialByEntrypoint ?? {}).some(Boolean);
}

function sumMetric(
  assets: AnalyzerAsset[],
  key: 'gzipSize' | 'parsedSize' | 'statSize',
): number {
  return assets.reduce((total, asset) => total + (asset[key] ?? 0), 0);
}

function summarizeOptionalMetric(
  assets: AnalyzerAsset[],
  key: 'gzipSize' | 'parsedSize',
): number | null {
  if (
    !assets.length ||
    !assets.some((asset) => typeof asset[key] === 'number')
  ) {
    return null;
  }

  return sumMetric(assets, key);
}

function summarizeRuntime(
  assets: AnalyzerAsset[],
  runtime: RuntimeName,
): RuntimeSummary {
  const initialAssets = assets.filter(isInitialAsset);

  return {
    assetCount: assets.length,
    initialAssetCount: initialAssets.length,
    initialGzipSize: summarizeOptionalMetric(initialAssets, 'gzipSize'),
    initialParsedSize: summarizeOptionalMetric(initialAssets, 'parsedSize'),
    initialStatSize: sumMetric(initialAssets, 'statSize'),
    runtime,
    totalGzipSize: summarizeOptionalMetric(assets, 'gzipSize'),
    totalParsedSize: summarizeOptionalMetric(assets, 'parsedSize'),
    totalStatSize: sumMetric(assets, 'statSize'),
  };
}

async function readRuntimeReport(
  workspace: string,
  app: AppName,
  runtime: RuntimeName,
): Promise<RuntimeSummary | null> {
  const reportPath = path.join(
    workspace,
    'apps',
    'web',
    app,
    '.next',
    'analyze',
    `${runtime}.json`,
  );

  try {
    const report = JSON.parse(
      await readFile(reportPath, 'utf8'),
    ) as AnalyzerAsset[];

    return summarizeRuntime(report, runtime);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const apps = await Promise.all(
    args.apps.map(async (app) => {
      const runtimes = Object.fromEntries(
        (
          await Promise.all(
            RUNTIMES.map(async (runtime) => [
              runtime,
              await readRuntimeReport(args.workspace, app, runtime),
            ]),
          )
        ).filter(
          (entry): entry is [RuntimeName, RuntimeSummary] => entry[1] !== null,
        ),
      ) as Partial<Record<RuntimeName, RuntimeSummary>>;

      return { app, runtimes };
    }),
  );

  const manifest: BundleManifest = {
    apps,
    generatedAt: new Date().toISOString(),
    workspace: path.resolve(args.workspace),
  };

  await mkdir(path.dirname(args.out), { recursive: true });
  await writeFile(args.out, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

await main();
