import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  buildReport,
  classifySurface,
  evaluateRatchet,
  formatAnnotations,
  formatSummary,
  matchSourceFile,
  measureChangedCoverage,
  parseLcov,
  parseUnifiedDiff,
  readBaseline,
} from './changed-code-coverage.mjs';
import { classifyChangedFile } from './changed-code-coverage.policy.mjs';

const CI_WORKFLOW = readFileSync(
  fileURLToPath(new URL('../../.github/workflows/ci.yml', import.meta.url)),
  'utf8',
);
const BASELINE = readBaseline();

function surface(name, result, lcov) {
  return {
    ...classifySurface({ name, result, lcovPath: `${name}.info`, lcov }),
    lcov,
  };
}

function report({ changedFiles, surfaces, baseline = BASELINE }) {
  return buildReport({
    baseSha: 'base0000',
    headSha: 'head0000',
    changedFiles: new Map(changedFiles),
    surfaces,
    baseline,
  });
}

// ── Exclusion policy ────────────────────────────────────────────────────────

test('policy excludes only paths a coverage report can never attribute', () => {
  const expected = [
    ['docs/self-hosting.md', 'non-executable-extension'],
    ['packages/props/src/brand.props.d.ts', 'declaration-only'],
    ['packages/ui/dist/index.js', 'vendored-or-build-output'],
    ['apps/app/node_modules/dep/index.js', 'vendored-or-build-output'],
    ['packages/prisma/src/generated/client.ts', 'generated-source'],
    ['packages/api-client/src/schema.gen.ts', 'generated-source'],
    [
      'apps/server/api/src/services/brands/brands.service.spec.ts',
      'test-source',
    ],
    ['apps/app/components/card.test.tsx', 'test-source'],
    ['apps/server/api/test/setup-unit.ts', 'test-support'],
    ['apps/app/__mocks__/router.ts', 'test-support'],
    ['playwright/e2e/login.ts', 'playwright-suite'],
    ['apps/app/vitest.config.mts', 'tooling-config'],
    ['apps/app/next.config.ts', 'tooling-config'],
    [
      'apps/server/api/src/services/brands/brands.module.ts',
      'server-uninstrumented',
    ],
    ['apps/server/api/src/services/brands/index.ts', 'server-uninstrumented'],
    ['apps/server/api/src/main.ts', 'server-uninstrumented'],
    ['scripts/ci/changed-code-coverage.mjs', 'repository-tooling'],
    ['.github/actions/setup-bun-env/index.mjs', 'repository-tooling'],
    // Workflow YAML is caught by the extension rule before it reaches the
    // tooling rule; both exclude, and the order is the reviewed one.
    ['.github/workflows/ci.yml', 'non-executable-extension'],
  ];

  for (const [file, ruleId] of expected) {
    const classification = classifyChangedFile(file);
    assert.equal(classification.included, false, `${file} should be excluded`);
    assert.equal(
      classification.ruleId,
      ruleId,
      `${file} matched the wrong rule`,
    );
    assert.ok(
      classification.reason.length > 0,
      `${file} needs a stated reason`,
    );
  }
});

test('policy keeps the near-misses that carry real first-party logic', () => {
  // Each of these is one regex tweak away from being swallowed by a rule above.
  // They are product code and must stay measured.
  const included = [
    'packages/serializers/src/configs/content/post.config.ts',
    'packages/ui/src/primitives/button/index.ts',
    'apps/app/proxy.ts',
    'apps/app/app/(protected)/[orgSlug]/content.tsx',
    'apps/server/api/src/services/brands/brands.service.ts',
    'ee/packages/billing/src/stripe.provider.ts',
    'packages/workflows/src/engine/runner.ts',
    'apps/app/lib/generated-content-helpers.ts',
  ];

  for (const file of included) {
    const classification = classifyChangedFile(file);
    assert.equal(classification.included, true, `${file} must stay measured`);
    assert.equal(classification.ruleId, null);
  }
});

test('policy normalizes paths and rejects empty input', () => {
  assert.equal(
    classifyChangedFile('./apps/app/page.tsx').file,
    'apps/app/page.tsx',
  );
  assert.throws(() => classifyChangedFile(''), TypeError);
});

// ── Diff parsing ────────────────────────────────────────────────────────────

test('unified diff yields the added lines of each post-image file', () => {
  const diff = [
    'diff --git a/apps/app/a.ts b/apps/app/a.ts',
    '--- a/apps/app/a.ts',
    '+++ b/apps/app/a.ts',
    '@@ -10,0 +11,3 @@',
    '+one',
    '+two',
    '+three',
    '@@ -30 +33 @@',
    '-old',
    '+new',
    'diff --git a/apps/app/b.ts b/apps/app/b.ts',
    '--- a/apps/app/b.ts',
    '+++ b/apps/app/b.ts',
    '@@ -1,4 +0,0 @@',
    '-gone',
  ].join('\n');

  const changed = parseUnifiedDiff(diff);
  assert.deepEqual(changed.get('apps/app/a.ts'), [11, 12, 13, 33]);
  // A hunk that only deletes has no post-image line to measure.
  assert.equal(changed.has('apps/app/b.ts'), false);
});

test('unified diff ignores files deleted outright', () => {
  const diff = [
    'diff --git a/apps/app/gone.ts b/apps/app/gone.ts',
    '--- a/apps/app/gone.ts',
    '+++ /dev/null',
    '@@ -1,3 +0,0 @@',
    '-a',
  ].join('\n');

  assert.equal(parseUnifiedDiff(diff).size, 0);
});

// ── LCOV parsing ────────────────────────────────────────────────────────────

test('lcov parsing merges repeated records for the same source file', () => {
  const lcov = [
    'SF:/repo/apps/app/a.ts',
    'DA:1,1',
    'DA:2,0',
    'BRDA:2,0,0,1',
    'BRDA:2,0,1,-',
    'end_of_record',
    'SF:/repo/apps/app/a.ts',
    'DA:1,4',
    'DA:2,0',
    'BRDA:2,0,1,2',
    'end_of_record',
  ].join('\n');

  const records = parseLcov(lcov);
  const record = records.get('/repo/apps/app/a.ts');
  assert.equal(record.lines.get(1), 5);
  assert.equal(record.lines.get(2), 0);
  // `-` (branch never evaluated) contributes zero, the second shard's 2 lands.
  assert.equal(record.branches.get('2:0:1'), 2);
  assert.equal(record.branches.get('2:0:0'), 1);
});

test('source-file matching resolves absolute and workspace-relative lcov paths', () => {
  const changed = ['apps/app/lib/a.ts', 'apps/server/api/src/b.ts'];

  assert.equal(
    matchSourceFile('/home/runner/work/repo/apps/app/lib/a.ts', changed),
    'apps/app/lib/a.ts',
  );
  assert.equal(
    matchSourceFile('src/b.ts', changed),
    'apps/server/api/src/b.ts',
  );
  assert.equal(
    matchSourceFile('apps/app/lib/a.ts', changed),
    'apps/app/lib/a.ts',
  );
  assert.equal(matchSourceFile('/repo/somewhere/else.ts', changed), null);
});

test('ambiguous suffix matches are dropped rather than attributed to a guess', () => {
  const changed = ['packages/one/src/index.ts', 'packages/two/src/index.ts'];
  assert.equal(matchSourceFile('src/index.ts', changed), null);
  // A longer unambiguous suffix still resolves.
  assert.equal(
    matchSourceFile('/repo/packages/two/src/index.ts', changed),
    'packages/two/src/index.ts',
  );
});

// ── Measurement ─────────────────────────────────────────────────────────────

test('measurement counts only executable changed lines and reports unmeasured files', () => {
  const measurement = measureChangedCoverage({
    changedLinesByFile: new Map([
      ['apps/app/a.ts', [1, 2, 3, 4]],
      ['apps/app/never-imported.ts', [7, 8]],
    ]),
    coverageByFile: new Map([
      [
        'apps/app/a.ts',
        {
          // Line 3 is a comment: present in the hunk, absent from the report.
          lines: new Map([
            [1, 2],
            [2, 0],
            [4, 0],
          ]),
          branches: new Map([
            ['2:0:0', 1],
            ['2:0:1', 0],
            ['99:0:0', 0],
          ]),
        },
      ],
    ]),
  });

  assert.equal(measurement.totals.lines.measured, 3);
  assert.equal(measurement.totals.lines.covered, 1);
  assert.equal(measurement.totals.lines.unmeasured, 2);
  assert.equal(measurement.totals.lines.percent, 33.33);
  // Unmeasured lines counted as uncovered: 1 covered of 5 changed.
  assert.equal(measurement.totals.lines.strictPercent, 20);
  // The branch on line 99 is outside the diff and must not be counted.
  assert.equal(measurement.totals.branches.measured, 2);
  assert.equal(measurement.totals.branches.covered, 1);

  const [measured, unmeasured] = measurement.files;
  assert.equal(measured.status, 'measured');
  assert.deepEqual(measured.uncoveredLines, [2, 4]);
  assert.equal(unmeasured.status, 'unmeasured');
  assert.equal(unmeasured.lines.percent, null);
});

// ── Surfaces and disposition ────────────────────────────────────────────────

test('a clean run producing no lcov is unmeasured, not an infrastructure failure', () => {
  assert.equal(surface('app', 'success', '').status, 'no-coverage');
  assert.equal(surface('app', 'success', null).status, 'no-coverage');
  assert.equal(surface('app', 'skipped', null).status, 'not-applicable');
  assert.equal(surface('app', 'failure', null).status, 'infrastructure-failed');
  assert.equal(
    surface('app', 'cancelled', null).status,
    'infrastructure-failed',
  );
  assert.throws(() => surface('app', 'weird', null), /job result/);
});

test('a failed surface rejects the measurement instead of publishing a pass', () => {
  const built = report({
    changedFiles: [['apps/app/a.ts', [1]]],
    surfaces: [surface('app', 'failure', null)],
  });

  assert.equal(built.normalized.disposition, 'infrastructure-failed');
});

test('a diff with no measurable file is not-applicable', () => {
  const built = report({
    changedFiles: [
      ['docs/readme.md', [1]],
      ['apps/app/a.test.ts', [1]],
    ],
    surfaces: [surface('app', 'skipped', null)],
  });

  assert.equal(built.normalized.disposition, 'not-applicable');
  assert.equal(built.normalized.changedFileCount, 0);
  assert.equal(built.normalized.exclusions.length, 2);
});

test('observation mode never reaches a failing disposition', () => {
  const lcov = [
    'SF:/repo/apps/app/a.ts',
    'DA:1,0',
    'DA:2,0',
    'end_of_record',
  ].join('\n');
  const built = report({
    changedFiles: [['apps/app/a.ts', [1, 2]]],
    surfaces: [surface('app', 'success', lcov)],
  });

  assert.equal(built.normalized.mode, 'observation');
  assert.equal(built.normalized.totals.lines.percent, 0);
  assert.equal(built.normalized.disposition, 'observation-only');
});

test('enforcement mode is what turns a shortfall into a failure', () => {
  const lcov = [
    'SF:/repo/apps/app/a.ts',
    'DA:1,0',
    'DA:2,0',
    'end_of_record',
  ].join('\n');
  const built = report({
    changedFiles: [['apps/app/a.ts', [1, 2]]],
    surfaces: [surface('app', 'success', lcov)],
    baseline: {
      ...BASELINE,
      mode: 'enforcement',
      ratchet: { branches: null, lines: 70 },
    },
  });

  assert.equal(built.normalized.disposition, 'below-ratchet');
});

test('enforcement counts unmeasured changed lines as uncovered once promoted', () => {
  const baseline = {
    ...BASELINE,
    mode: 'enforcement',
    ratchet: { branches: null, lines: 70 },
    treatUnmeasuredAsUncovered: true,
  };
  // Every changed line is fully covered where it is measured, but half the diff
  // sits in a surface nothing instrumented. Strict accounting must catch it.
  const lcov = [
    'SF:/repo/apps/app/a.ts',
    'DA:1,3',
    'DA:2,3',
    'end_of_record',
  ].join('\n');
  const built = report({
    changedFiles: [
      ['apps/app/a.ts', [1, 2]],
      ['apps/website/b.ts', [1, 2]],
    ],
    surfaces: [surface('app', 'success', lcov)],
    baseline,
  });

  assert.equal(built.normalized.totals.lines.percent, 100);
  assert.equal(built.normalized.totals.lines.strictPercent, 50);
  assert.equal(built.normalized.disposition, 'below-ratchet');
});

test('the rounding margin absorbs a sub-point shortfall', () => {
  const baseline = { ...BASELINE, roundingMarginPercentagePoints: 0.5 };
  const totals = {
    branches: { percent: 100 },
    lines: { percent: 79.7, strictPercent: 79.7 },
  };

  assert.equal(
    evaluateRatchet({
      baseline: { ...baseline, ratchet: { branches: null, lines: 80 } },
      totals,
    }).passed,
    true,
  );
  assert.equal(
    evaluateRatchet({
      baseline: { ...baseline, ratchet: { branches: null, lines: 81 } },
      totals,
    }).passed,
    false,
  );
});

// ── Determinism and presentation ────────────────────────────────────────────

test('the normalized report is byte-identical for the same base/head pair', () => {
  const lcov = [
    'SF:/repo/apps/app/z.ts',
    'DA:1,1',
    'end_of_record',
    'SF:/repo/apps/app/a.ts',
    'DA:2,0',
    'end_of_record',
  ].join('\n');
  const build = (order) =>
    JSON.stringify(
      report({
        changedFiles: order,
        surfaces: [
          surface('api', 'skipped', null),
          surface('app', 'success', lcov),
        ],
      }).normalized,
    );

  const forward = build([
    ['apps/app/a.ts', [2]],
    ['apps/app/z.ts', [1]],
  ]);
  const reversed = build([
    ['apps/app/z.ts', [1]],
    ['apps/app/a.ts', [2]],
  ]);

  assert.equal(forward, reversed);
  // Nothing run-scoped may leak into the normalized half.
  assert.equal(
    /runId|runAttempt|latency|\d{4}-\d{2}-\d{2}T/.test(forward),
    false,
  );
});

test('annotations collapse contiguous uncovered runs and stay bounded', () => {
  const lcov = [
    'SF:/repo/apps/app/a.ts',
    'DA:1,0',
    'DA:2,0',
    'DA:3,0',
    'DA:9,0',
    'end_of_record',
  ].join('\n');
  const built = report({
    changedFiles: [['apps/app/a.ts', [1, 2, 3, 9]]],
    surfaces: [surface('app', 'success', lcov)],
  });

  const annotations = formatAnnotations(built);
  assert.equal(annotations.length, 2);
  assert.match(
    annotations[0],
    /^::notice file=apps\/app\/a\.ts,line=1,endLine=3::/,
  );
  assert.match(annotations[1], /line=9,endLine=9::/);
  assert.equal(formatAnnotations(built, 1).length, 1);
});

test('the summary states the mode, the totals, and the surface roll-call', () => {
  const lcov = [
    'SF:/repo/apps/app/a.ts',
    'DA:1,1',
    'DA:2,0',
    'end_of_record',
  ].join('\n');
  const summary = formatSummary(
    report({
      changedFiles: [
        ['apps/app/a.ts', [1, 2]],
        ['apps/website/b.ts', [5]],
      ],
      surfaces: [
        surface('app', 'success', lcov),
        surface('api', 'skipped', null),
      ],
    }),
  );

  assert.match(summary, /# Changed-code coverage/);
  assert.match(summary, /Mode: `observation`/);
  assert.match(summary, /cannot fail the pull request/);
  assert.match(summary, /\| Lines \| 1 \| 2 \| 50\.00% \| — \|/);
  assert.match(
    summary,
    /1 changed line\(s\) in 1 file\(s\) were not instrumented/,
  );
  assert.match(summary, /\| api \| skipped \| not-applicable \|/);
});

// ── Baseline contract ───────────────────────────────────────────────────────

test('the committed baseline is a reviewable observation-phase record', () => {
  assert.equal(BASELINE.issue, 1849);
  assert.equal(BASELINE.mode, 'observation');
  assert.equal(BASELINE.ratchet.lines, null);
  assert.equal(BASELINE.ratchet.branches, null);
  assert.equal(BASELINE.treatUnmeasuredAsUncovered, false);
  assert.ok(BASELINE.observation.requiredRuns >= 1);
  assert.ok(BASELINE.observation.latencyBudgetMinutesP95 <= 20);
  assert.ok(Array.isArray(BASELINE.ratchetHistory));
  assert.ok(BASELINE.ratchetHistory.length >= 1);
});

test('the ratchet history can only be appended to, never lowered', () => {
  const latest = BASELINE.ratchetHistory.at(-1);
  assert.equal(latest.lines, BASELINE.ratchet.lines);
  assert.equal(latest.branches, BASELINE.ratchet.branches);
  assert.equal(latest.mode, BASELINE.mode);

  let previous = { branches: null, lines: null };
  for (const entry of BASELINE.ratchetHistory) {
    assert.ok(
      Number.isInteger(entry.issue),
      'every ratchet change must link the issue that reviewed it',
    );
    assert.match(entry.adoptedAt, /^\d{4}-\d{2}-\d{2}$/);
    for (const metric of ['lines', 'branches']) {
      if (previous[metric] === null) continue;
      assert.ok(
        entry[metric] !== null && entry[metric] >= previous[metric],
        `${metric} ratchet may never be lowered (${previous[metric]} → ${entry[metric]})`,
      );
    }
    previous = entry;
  }
});

// ── Workflow contract ───────────────────────────────────────────────────────

test('the coverage jobs live in CI and can never gate a merge', () => {
  for (const job of [
    'coverage-changed-app:',
    'coverage-changed-api:',
    'coverage-changed-report:',
  ]) {
    assert.ok(CI_WORKFLOW.includes(job), `ci.yml must define ${job}`);
  }

  const gate = CI_WORKFLOW.slice(
    CI_WORKFLOW.indexOf('  tests-gate:'),
    CI_WORKFLOW.indexOf('  coverage-changed-app:'),
  );
  assert.ok(gate.length > 0, 'tests-gate must precede the coverage jobs');
  assert.equal(
    gate.includes('coverage-changed'),
    false,
    'tests-gate must not depend on an observation-mode job',
  );
});

/** Slice one job out of ci.yml, ending at the next job key at the same indent. */
function ciJob(name) {
  const start = CI_WORKFLOW.indexOf(`\n  ${name}:\n`);
  assert.notEqual(start, -1, `ci.yml must define ${name}`);
  const rest = CI_WORKFLOW.slice(start + 1);
  const end = rest.search(/\n {2}[a-z][a-z0-9-]*:\n/);
  return end === -1 ? rest : rest.slice(0, end);
}

test('each coverage surface is budgeted and non-fatal', () => {
  for (const name of ['coverage-changed-app', 'coverage-changed-api']) {
    const job = ciJob(name);
    assert.match(
      job,
      /timeout-minutes: 20/,
      `${name} must honour the 20-minute budget`,
    );
    assert.match(
      job,
      /continue-on-error: true/,
      `${name} must never fail the pull request`,
    );
    assert.match(
      job,
      /--changed "\$BASE"/,
      `${name} must measure the affected scope only`,
    );
    assert.match(job, /--coverage/, `${name} must run instrumented`);
    // The affected scope is decided by the existing planner, not re-derived.
    assert.match(job, /needs: \[trust, test-scope\]/);
  }
});

test('the API surface suppresses whole-repo thresholds it can never meet', () => {
  const apiConfig = readFileSync(
    fileURLToPath(
      new URL('../../apps/server/api/vitest.config.ts', import.meta.url),
    ),
    'utf8',
  );

  assert.match(apiConfig, /CHANGED_CODE_COVERAGE/);
  assert.match(apiConfig, /isShardRun \|\| isChangedCodeCoverageRun/);
  assert.match(CI_WORKFLOW, /CHANGED_CODE_COVERAGE: '1'/);
});

test('observation evidence outlives the default artifact retention', () => {
  const job = ciJob('coverage-changed-report');
  assert.match(job, /retention-days: 90/);
  assert.match(
    job,
    /name: changed-code-coverage-\$\{\{ github\.event\.pull_request\.number/,
  );
  // Runs even when a surface job failed or was skipped, so an infrastructure
  // failure is still recorded rather than silently producing no report at all.
  assert.match(job, /if: >-\n\s+always\(\)/);
});
