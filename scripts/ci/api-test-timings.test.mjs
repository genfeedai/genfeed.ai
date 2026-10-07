import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import ApiTestTimingsReporter, {
  collectModuleTimings,
  formatTimingSummary,
} from './api-test-timings-reporter.mjs';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const REPORTER = path.join(ROOT, 'scripts/ci/api-test-timings-reporter.mjs');
const VITEST = path.join(ROOT, 'node_modules/vitest/vitest.mjs');

test('records separate phases, retries and states without recording test data', () => {
  const module = {
    moduleId: '/repo/apps/server/api/example.spec.ts',
    state: () => 'failed',
    diagnostic: () => ({
      collectDuration: 11,
      duration: 17,
      environmentSetupDuration: 2,
      prepareDuration: 3,
      setupDuration: 5,
      concurrencyId: 2,
      workerId: 7,
      heap: undefined,
      importDurations: { secret: { selfTime: 99 } },
    }),
    children: {
      allTests: () => [
        {
          result: () => ({ state: 'passed' }),
          diagnostic: () => ({ retryCount: 1 }),
        },
        {
          result: () => ({ state: 'failed', errors: ['private'] }),
          diagnostic: () => ({ retryCount: 0 }),
        },
        {
          result: () => ({ state: 'skipped' }),
          diagnostic: () => undefined,
        },
        {
          options: { mode: 'todo' },
          result: () => ({ state: 'skipped' }),
          diagnostic: () => undefined,
        },
      ],
    },
  };
  const timing = collectModuleTimings(module, '/repo');
  assert.equal(timing.file, 'apps/server/api/example.spec.ts');
  assert.deepEqual(timing.tests, {
    passed: 1,
    failed: 1,
    skipped: 1,
    todo: 1,
    pending: 0,
  });
  assert.equal(timing.retryCount, 1);
  assert.equal(timing.collectMs, 11);
  assert.equal(timing.setupMs, 5);
  assert.equal(timing.testsAndHooksMs, 17);
  assert.equal(timing.observedWorkMs, 38);
  assert.doesNotMatch(
    JSON.stringify(timing),
    /private|secret|errors|importDurations/,
  );
});

test('writes an incomplete start receipt and preserves failed collection modules', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'api-timing-unit-'));
  try {
    const outputFile = path.join(root, 'nested/timings.json');
    const reporter = new ApiTestTimingsReporter({
      outputFile,
      root,
      env: { GITHUB_SHA: 'candidate', CI_BASE_SHA: 'base', FORCE_FULL: 'true' },
    });
    reporter.onInit({
      version: '5.0.3',
      config: {
        maxWorkers: 2,
        pool: 'forks',
        isolate: true,
        shard: { index: 1, count: 4 },
      },
    });
    reporter.onTestRunStart([{ moduleId: path.join(root, 'broken.spec.ts') }]);
    assert.equal(
      JSON.parse(readFileSync(outputFile, 'utf8')).isComplete,
      false,
    );
    const module = {
      moduleId: path.join(root, 'broken.spec.ts'),
      state: () => 'failed',
      diagnostic: () => ({
        collectDuration: 13,
        duration: 0,
        environmentSetupDuration: 0,
        prepareDuration: 0,
        setupDuration: 0,
        concurrencyId: 1,
        workerId: 1,
      }),
      children: { allTests: () => [] },
    };
    reporter.onTestRunEnd([module], [{ message: 'private error' }], 'passed');
    const record = JSON.parse(readFileSync(outputFile, 'utf8'));
    assert.equal(record.isComplete, true);
    assert.equal(record.sourceSha, 'candidate');
    assert.equal(record.selection.mode, 'full');
    assert.equal(record.selection.baseSha, null);
    assert.equal(record.unhandledErrorCount, 1);
    assert.equal(record.files[0].state, 'failed');
    assert.equal(record.files[0].collectMs, 13);
    assert.deepEqual(record.candidateFiles, ['broken.spec.ts']);
    assert.doesNotMatch(JSON.stringify(record), /private error/);
    assert.match(formatTimingSummary(record), /failed/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('real Vitest sharding preserves the selected union, skips, retries and failure exit', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'api-timing-vitest-'));
  try {
    writeFileSync(path.join(root, 'package.json'), '{"type":"module"}');
    writeFileSync(
      path.join(root, 'vitest.config.mjs'),
      `export default { test: { include: ['*.spec.mjs'], isolate: true } };`,
    );
    // Import the installed runtime directly: the disposable fixture has no dependencies.
    const vitestUrl = new URL(
      '../../node_modules/vitest/dist/index.js',
      import.meta.url,
    ).href;
    const sources = {
      'a.spec.mjs': `import { it, expect } from ${JSON.stringify(vitestUrl)}; it('pass', () => expect(1).toBe(1));`,
      'b.spec.mjs': `import { it } from ${JSON.stringify(vitestUrl)}; it.skip('skip', () => {}); it.todo('future coverage');`,
      'c.spec.mjs': `import { it } from ${JSON.stringify(vitestUrl)}; let attempts = 0; it('retry', { retry: 1 }, () => { if (attempts++ === 0) throw new Error('first attempt'); });`,
      'd.spec.mjs': `import { it, expect } from ${JSON.stringify(vitestUrl)}; it('fail', () => expect(1).toBe(2));`,
    };
    for (const [file, source] of Object.entries(sources))
      writeFileSync(path.join(root, file), source);
    const baselineFile = path.join(root, 'baseline.json');
    const baseline = spawnSync(
      process.execPath,
      [
        VITEST,
        'run',
        '--config',
        'vitest.config.mjs',
        '--maxWorkers=2',
        '--reporter=json',
        `--outputFile=${baselineFile}`,
      ],
      { cwd: root, env: process.env, encoding: 'utf8', timeout: 60000 },
    );
    assert.equal(baseline.status, 1, baseline.stderr);
    const baselineRecord = JSON.parse(readFileSync(baselineFile, 'utf8'));
    const records = [];
    const exits = [];
    for (const shard of [1, 2]) {
      const outputFile = path.join(root, `shard-${shard}.json`);
      const result = spawnSync(
        process.execPath,
        [
          VITEST,
          'run',
          '--config',
          'vitest.config.mjs',
          '--maxWorkers=2',
          '--reporter=default',
          `--reporter=${REPORTER}`,
          `--shard=${shard}/2`,
        ],
        {
          cwd: root,
          env: {
            ...process.env,
            API_TEST_TIMINGS_OUTPUT: outputFile,
            GITHUB_WORKSPACE: root,
            GITHUB_SHA: 'fixture',
            CI_BASE_SHA: '',
            FORCE_FULL: 'true',
          },
          encoding: 'utf8',
          timeout: 60000,
        },
      );
      assert.equal(result.error, undefined, result.stderr);
      assert.ok([0, 1].includes(result.status), result.stderr);
      exits.push(result.status);
      const record = JSON.parse(readFileSync(outputFile, 'utf8'));
      assert.equal(record.isComplete, true);
      assert.equal(record.runtime.maxWorkers, 2);
      assert.deepEqual(record.shard, { index: shard, count: 2 });
      assert.equal(record.runtime.vitestVersion, '5.0.3');
      assert.deepEqual(record.candidateFiles, Object.keys(sources).sort());
      records.push(record);
    }
    assert.deepEqual(exits.sort(), [0, 1]);
    const files = records.flatMap((r) => r.files);
    assert.deepEqual(
      files.map((f) => f.file).sort(),
      Object.keys(sources).sort(),
    );
    assert.equal(new Set(files.map((f) => f.file)).size, 4);
    assert.deepEqual(
      files.map((f) => f.file).sort(),
      baselineRecord.testResults.map((f) => path.basename(f.name)).sort(),
    );
    assert.equal(
      files.reduce((sum, f) => sum + f.tests.passed, 0),
      baselineRecord.numPassedTests,
    );
    assert.equal(
      files.reduce((sum, f) => sum + f.tests.failed, 0),
      baselineRecord.numFailedTests,
    );
    assert.equal(
      files.reduce((sum, f) => sum + f.tests.skipped, 0),
      baselineRecord.numPendingTests,
    );
    assert.equal(
      files.reduce((sum, f) => sum + f.tests.todo, 0),
      baselineRecord.numTodoTests,
    );
    assert.equal(
      files.reduce((sum, f) => sum + f.tests.todo, 0),
      1,
    );
    assert.equal(
      files.reduce((sum, f) => sum + f.tests.failed, 0),
      1,
    );
    assert.equal(
      files.reduce((sum, f) => sum + f.tests.skipped, 0),
      1,
    );
    assert.equal(
      files.reduce((sum, f) => sum + f.retryCount, 0),
      1,
    );
    assert.ok(
      files.every(
        (f) => Number.isFinite(f.observedWorkMs) && f.observedWorkMs >= 0,
      ),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('CI retains affected selection and connected fixtures and uploads after failure', () => {
  const source = readFileSync(
    path.join(ROOT, '.github/workflows/ci.yml'),
    'utf8',
  );
  const api = source.split('\n  test-api:\n')[1].split('\n  build:\n')[0];
  assert.match(
    api,
    /SELECTION=\(--passWithNoTests --changed "\$\{CI_BASE_SHA\}"\)/,
  );
  assert.match(api, /--maxWorkers=2 "\$\{SELECTION\[@\]\}"/);
  assert.match(
    api,
    /--shard=\$\{\{ matrix\.shard \}\}\/\$\{\{ matrix\.total \}\}/,
  );
  for (const fixture of [
    'postgres:',
    'redis:',
    'BILLING_ACCOUNT_SCOPE_TEST_DATABASE_URL:',
    'CREDIT_BALANCE_TEST_DATABASE_URL:',
    'CRUN_TEST_REDIS_URL:',
  ])
    assert.ok(api.includes(fixture), fixture);
  assert.match(api, /--reporter=default/);
  assert.match(api, /--reporter=github-actions/);
  assert.match(api, /--reporter=.*api-test-timings-reporter\.mjs/);
  assert.match(
    api,
    /name: Upload API test timings\n\s+if: always\(\) && steps\.api-tests\.outcome != 'skipped' && steps\.api-tests\.outcome != ''/,
  );
  assert.match(api, /if-no-files-found: error/);
  assert.doesNotMatch(
    api,
    /continue-on-error|--bail|--retry|--exclude|isolate=false/,
  );
  const manifest = JSON.parse(
    readFileSync(path.join(ROOT, 'package.json'), 'utf8'),
  );
  assert.ok(
    manifest.scripts['test:executable-contracts'].includes(
      'scripts/ci/api-test-timings.test.mjs',
    ),
  );
});
