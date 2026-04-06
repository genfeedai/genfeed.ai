import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const API_ROOT = path.resolve(import.meta.dirname, '..');
const RUNNER_SPEC = 'test/integration/api-response-benchmarks.runner.spec.ts';
const VITEST_CONFIG = 'vitest.config.e2e.ts';

function parseArgs(argv) {
  let isJson = false;
  let iterations = null;
  let reportDir = null;
  let updateBaseline = false;
  let warmup = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--json') {
      isJson = true;
      continue;
    }

    if (arg === '--update-baseline') {
      updateBaseline = true;
      continue;
    }

    if (arg === '--report-dir') {
      reportDir = argv[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (arg === '--iterations') {
      const parsedIterations = Number.parseInt(argv[index + 1] ?? '', 10);
      if (Number.isFinite(parsedIterations) && parsedIterations > 0) {
        iterations = String(parsedIterations);
      }
      index += 1;
      continue;
    }

    if (arg === '--warmup') {
      const parsedWarmup = Number.parseInt(argv[index + 1] ?? '', 10);
      if (Number.isFinite(parsedWarmup) && parsedWarmup >= 0) {
        warmup = String(parsedWarmup);
      }
      index += 1;
    }
  }

  return {
    isJson,
    iterations,
    reportDir,
    updateBaseline,
    warmup,
  };
}

function ensureReportDir(reportDir) {
  if (reportDir) {
    return path.resolve(process.cwd(), reportDir);
  }

  return fs.mkdtempSync(
    path.join(os.tmpdir(), 'genfeed-api-response-benchmarks-'),
  );
}

function printReportArtifacts(reportDir, isJson) {
  const reportFileName = isJson
    ? 'api-response-benchmarks.json'
    : 'api-response-benchmarks.md';
  const reportPath = path.join(reportDir, reportFileName);

  if (!fs.existsSync(reportPath)) {
    return;
  }

  process.stdout.write(fs.readFileSync(reportPath, 'utf8'));
}

const options = parseArgs(process.argv.slice(2));
const reportDir = ensureReportDir(options.reportDir);

const env = {
  ...process.env,
  API_RESPONSE_BENCHMARK_JSON: options.isJson ? '1' : '0',
  API_RESPONSE_BENCHMARK_REPORT_DIR: reportDir,
  API_RESPONSE_BENCHMARK_UPDATE_BASELINE: options.updateBaseline ? '1' : '0',
};

if (options.iterations) {
  env.API_RESPONSE_BENCHMARK_ITERATIONS = options.iterations;
}

if (options.warmup) {
  env.API_RESPONSE_BENCHMARK_WARMUP = options.warmup;
}

const result = spawnSync(
  'bunx',
  ['vitest', 'run', '--config', VITEST_CONFIG, RUNNER_SPEC],
  {
    cwd: API_ROOT,
    env,
    stdio: 'inherit',
  },
);

if (result.status === 0) {
  printReportArtifacts(reportDir, options.isJson);
}

process.exit(result.status ?? 1);
