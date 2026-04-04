#!/usr/bin/env bun

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_APPS = ['admin', 'app', 'chatgpt', 'marketplace', 'website'];

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

interface ReportSummary {
  missingApps: string[];
  mode: 'advisory' | 'enforce';
  reportCount: number;
  shouldFail: boolean;
  thresholdPercent: number;
}

interface CliArgs {
  inputDir: string;
  mode: 'advisory' | 'enforce';
  outJson: string;
  outMarkdown: string;
  threshold: number;
}

function isComparisonResult(value: unknown): value is BundleComparisonResult {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<BundleComparisonResult>;
  return (
    typeof candidate.app === 'string' &&
    typeof candidate.shouldFail === 'boolean' &&
    candidate.client !== undefined
  );
}

function parseArgs(argv: string[]): CliArgs {
  const args: Partial<CliArgs> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    if (current === '--input-dir' && next) {
      args.inputDir = next;
      index += 1;
      continue;
    }

    if (current === '--mode' && next) {
      if (next !== 'advisory' && next !== 'enforce') {
        throw new Error(`Unsupported mode: ${next}`);
      }

      args.mode = next;
      index += 1;
      continue;
    }

    if (current === '--out-json' && next) {
      args.outJson = next;
      index += 1;
      continue;
    }

    if (current === '--out-markdown' && next) {
      args.outMarkdown = next;
      index += 1;
      continue;
    }

    if (current === '--threshold' && next) {
      args.threshold = Number(next);
      index += 1;
    }
  }

  if (!args.inputDir || !args.outJson || !args.outMarkdown) {
    throw new Error(
      'Usage: bun run scripts/render-bundle-watchdog-report.ts --input-dir <dir> --out-json <file> --out-markdown <file> [--mode advisory|enforce] [--threshold 5]',
    );
  }

  return {
    inputDir: args.inputDir,
    mode: args.mode ?? 'advisory',
    outJson: args.outJson,
    outMarkdown: args.outMarkdown,
    threshold: args.threshold ?? 5,
  };
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) {
    return 'n/a';
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) {
    return `${kilobytes.toFixed(1)} KB`;
  }

  return `${(kilobytes / 1024).toFixed(2)} MB`;
}

function formatDelta(metric: MetricComparison): string {
  if (metric.deltaBytes === null || metric.deltaPercent === null) {
    return 'n/a';
  }

  const prefix = metric.deltaBytes > 0 ? '+' : '';
  return `${prefix}${formatBytes(metric.deltaBytes)} (${prefix}${metric.deltaPercent.toFixed(2)}%)`;
}

function formatStatus(result: BundleComparisonResult): string {
  if (result.client.deltaPercent === null) {
    return 'missing baseline';
  }

  if (result.shouldFail) {
    return 'regression';
  }

  if (result.client.deltaBytes !== null && result.client.deltaBytes < 0) {
    return 'improved';
  }

  return 'within threshold';
}

async function readComparisonResults(
  inputDir: string,
): Promise<BundleComparisonResult[]> {
  const entries = await readdir(inputDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => path.join(inputDir, entry.name));

  const results = await Promise.all(
    files.map(async (filePath) => {
      const parsed = JSON.parse(await readFile(filePath, 'utf8')) as unknown;
      return isComparisonResult(parsed) ? parsed : null;
    }),
  );

  return results.filter(
    (result): result is BundleComparisonResult => result !== null,
  );
}

function renderInformationalSection(results: BundleComparisonResult[]): string {
  const lines = [
    '<details>',
    '<summary>Node.js and edge runtime deltas</summary>',
    '',
  ];

  for (const result of results) {
    lines.push(`### ${result.app}`);

    for (const runtime of ['nodejs', 'edge'] as const) {
      const metric = result.informational[runtime];
      if (!metric) {
        lines.push(`- ${runtime}: not emitted`);
        continue;
      }

      lines.push(
        `- ${runtime}: ${formatBytes(metric.baseBytes)} -> ${formatBytes(metric.headBytes)} (${metric.baseLabel} / ${metric.headLabel}, ${formatDelta(metric)})`,
      );
    }

    lines.push('');
  }

  lines.push('</details>');
  return lines.join('\n');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const results = (await readComparisonResults(args.inputDir)).sort(
    (left, right) => left.app.localeCompare(right.app),
  );

  if (!results.length) {
    throw new Error(`No comparison results found in ${args.inputDir}`);
  }

  const resultsByApp = new Map(results.map((result) => [result.app, result]));
  const missingApps = DEFAULT_APPS.filter((app) => !resultsByApp.has(app));
  const threshold = results[0]?.regressionThresholdPercent ?? args.threshold;
  const shouldFail =
    missingApps.length > 0 || results.some((result) => result.shouldFail);

  const headerMode =
    args.mode === 'enforce' ? 'enforced threshold' : 'advisory threshold';

  const markdownLines = [
    '<!-- bundle-size-watchdog -->',
    '## Bundle Size Watchdog',
    '',
    `Mode: **${headerMode}**`,
    `Threshold: **>${threshold}%** regression on the client initial bundle metric`,
    '',
    '| App | Base | Head | Delta | Status |',
    '| --- | --- | --- | --- | --- |',
  ];

  for (const app of DEFAULT_APPS) {
    const result = resultsByApp.get(app);

    if (!result) {
      markdownLines.push(`| ${app} | n/a | n/a | n/a | build/report missing |`);
      continue;
    }

    markdownLines.push(
      `| ${app} | ${formatBytes(result.client.baseBytes)} | ${formatBytes(result.client.headBytes)} | ${formatDelta(result.client)} | ${formatStatus(result)} |`,
    );
  }

  if (missingApps.length > 0) {
    markdownLines.push('');
    markdownLines.push('### Missing reports');
    markdownLines.push('');
    for (const app of missingApps) {
      markdownLines.push(`- ${app}`);
    }
  }

  const regressions = results.filter((result) => result.shouldFail);
  if (regressions.length > 0) {
    markdownLines.push('');
    markdownLines.push('### Regressions above threshold');
    markdownLines.push('');
    for (const result of regressions) {
      markdownLines.push(
        `- ${result.app}: ${formatDelta(result.client)} against ${result.client.baseLabel}`,
      );
    }
  }

  markdownLines.push('');
  markdownLines.push(renderInformationalSection(results));
  markdownLines.push('');
  markdownLines.push(
    '_Primary metric: client initial gzip size, with parsed/stat fallbacks when gzip is unavailable._',
  );

  const summary: ReportSummary = {
    missingApps,
    mode: args.mode,
    reportCount: results.length,
    shouldFail,
    thresholdPercent: threshold,
  };

  await mkdir(path.dirname(args.outMarkdown), { recursive: true });
  await writeFile(args.outMarkdown, `${markdownLines.join('\n')}\n`, 'utf8');

  await mkdir(path.dirname(args.outJson), { recursive: true });
  await writeFile(
    args.outJson,
    `${JSON.stringify(summary, null, 2)}\n`,
    'utf8',
  );
}

await main();
