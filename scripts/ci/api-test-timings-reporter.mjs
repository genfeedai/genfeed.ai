import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

// The reporter observes the completed Vitest modules. It never selects files,
// changes test order, or prints assertion names, error messages or environment data.
export function collectModuleTimings(module, root) {
  const diagnostic = module.diagnostic();
  const tests = { passed: 0, failed: 0, skipped: 0, todo: 0, pending: 0 };
  let retryCount = 0;
  for (const item of module.children.allTests()) {
    // Vitest's public result groups todo with skipped; retain the distinction
    // its normal reporter makes so missing coverage cannot look like a skip.
    const state = item.options?.mode === 'todo' ? 'todo' : item.result().state;
    tests[state]++;
    // Skipped or not-yet-run test cases have no diagnostic object.
    retryCount += item.diagnostic()?.retryCount ?? 0;
  }
  const phases = {
    collectMs: diagnostic.collectDuration,
    environmentSetupMs: diagnostic.environmentSetupDuration,
    prepareMs: diagnostic.prepareDuration,
    setupMs: diagnostic.setupDuration,
    testsAndHooksMs: diagnostic.duration,
  };
  return {
    file: path.relative(root, module.moduleId).split(path.sep).join('/'),
    state: module.state(),
    tests,
    retryCount,
    ...phases,
    // A scheduling estimate, not wall-clock time: tests/hooks may overlap.
    observedWorkMs: Object.values(phases).reduce(
      (sum, value) => sum + value,
      0,
    ),
    concurrencyId: diagnostic.concurrencyId,
    workerId: diagnostic.workerId,
  };
}

export default class ApiTestTimingsReporter {
  constructor({
    env = process.env,
    outputFile = env.API_TEST_TIMINGS_OUTPUT,
    root,
  } = {}) {
    if (!outputFile) throw new Error('API_TEST_TIMINGS_OUTPUT is required');
    this.outputFile = outputFile;
    this.root = root;
    this.env = env;
  }

  onInit(vitest) {
    // Keep repository-relative CI paths; disposable external fixtures use
    // their own project root rather than leaking an absolute temporary path.
    this.root ??= path.relative(ROOT, vitest.config.root).startsWith('..')
      ? vitest.config.root
      : ROOT;
    this.runtime = {
      nodeVersion: process.version,
      vitestVersion: vitest.version,
      checkRuntime: this.env.CI_CHECK_RUNTIME || null,
      runnerOS: this.env.RUNNER_OS || process.platform,
      runnerArch: this.env.RUNNER_ARCH || process.arch,
      maxWorkers: vitest.config.maxWorkers,
      pool: vitest.config.pool,
      isIsolated: vitest.config.isolate,
    };
    this.shard = vitest.config.shard || { index: 1, count: 1 };
  }

  onTestRunStart(specifications) {
    this.startedAt = new Date().toISOString();
    this.started = performance.now();
    // Vitest 5 supplies the candidates BEFORE sharding in this callback.
    this.candidateFiles = specifications
      .map((specification) =>
        path
          .relative(this.root, specification.moduleId)
          .split(path.sep)
          .join('/'),
      )
      .sort();
    // If the process is killed, this explicitly incomplete receipt survives.
    this.writeRecord([], [], 'running', false);
  }

  onTestRunEnd(modules, unhandledErrors, reason) {
    this.writeRecord(
      modules,
      unhandledErrors,
      reason,
      reason !== 'interrupted',
    );
  }

  writeRecord(modules, unhandledErrors, reason, isComplete) {
    const isAffected =
      this.env.FORCE_FULL !== 'true' && Boolean(this.env.CI_BASE_SHA);
    const record = {
      schemaVersion: 1,
      sourceSha: this.env.GITHUB_SHA || null,
      runId: this.env.GITHUB_RUN_ID || null,
      runAttempt: this.env.GITHUB_RUN_ATTEMPT || null,
      selection: {
        mode: isAffected ? 'affected' : 'full',
        baseSha: isAffected ? this.env.CI_BASE_SHA : null,
      },
      shard: this.shard,
      candidateFiles: this.candidateFiles,
      runtime: this.runtime,
      startedAt: this.startedAt,
      finishedAt: isComplete ? new Date().toISOString() : null,
      wallMs: performance.now() - this.started,
      isComplete,
      reason,
      unhandledErrorCount: unhandledErrors.length,
      files: modules
        .map((module) => collectModuleTimings(module, this.root))
        .sort((a, b) => a.file.localeCompare(b.file)),
    };
    mkdirSync(path.dirname(this.outputFile), { recursive: true });
    writeFileSync(this.outputFile, `${JSON.stringify(record, null, 2)}\n`);
  }
}

function tableCell(value) {
  return String(value).replace(/[|`<>\r\n]/g, ' ');
}

export function formatTimingSummary(record) {
  const files = [...record.files].sort(
    (a, b) =>
      b.observedWorkMs - a.observedWorkMs || a.file.localeCompare(b.file),
  );
  const counts = { passed: 0, failed: 0, skipped: 0, todo: 0, pending: 0 };
  let retries = 0;
  for (const file of files) {
    for (const state of Object.keys(counts)) counts[state] += file.tests[state];
    retries += file.retryCount;
  }
  const seconds = (milliseconds) => (milliseconds / 1000).toFixed(2);
  return [
    `### API timings — shard ${record.shard.index}/${record.shard.count}`,
    '',
    `Source: \`${tableCell(record.sourceSha || 'local')}\`. Selection: ${record.selection.mode}. Complete receipt: **${record.isComplete}**.`,
    '',
    `Vitest wall time: **${seconds(record.wallMs)}s**. Files with results: ${files.length}. Candidates before sharding: ${record.candidateFiles.length}. Assertions: ${counts.passed} passed, ${counts.failed} failed, ${counts.skipped} skipped, ${counts.todo} todo, ${counts.pending} pending. Retries: ${retries}. Unhandled errors: ${record.unhandledErrorCount}.`,
    '',
    'Phase values are accumulated per-file measurements; their sums across workers are not job wall time. Tests/hooks can overlap. Outer setup, database and dependency-build time remains in the Actions step timings.',
    '',
    '| Slowest files by observed work | Import/collect (s) | Setup (s) | Tests/hooks (s) | Prepare/environment (s) | Result |',
    '|---|---:|---:|---:|---:|---|',
    ...files
      .slice(0, 20)
      .map(
        (file) =>
          `| ${tableCell(file.file)} | ${seconds(file.collectMs)} | ${seconds(file.setupMs)} | ${seconds(file.testsAndHooksMs)} | ${seconds(file.prepareMs + file.environmentSetupMs)} | ${tableCell(file.state)} |`,
      ),
    '',
  ].join('\n');
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  const file = process.argv[2];
  if (!file)
    throw new Error('Usage: api-test-timings-reporter.mjs <receipt.json>');
  process.stdout.write(
    formatTimingSummary(JSON.parse(readFileSync(file, 'utf8'))),
  );
}
