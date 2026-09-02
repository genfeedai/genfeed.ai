import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  aggregateSurfaceShards,
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
  readSurfacePath,
  resolveDiffInputs,
  worstResult,
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
    'apps/server/api/src/collections/subscriptions/services/subscriptions.service.ts',
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

test('symbolic and abbreviated refs resolve to canonical commit IDs before diffing', async () => {
  const canonicalBase = '1'.repeat(40);
  const canonicalHead = '2'.repeat(40);
  const diff = '+++ b/apps/app/a.ts\n@@ -0,0 +1 @@\n+changed\n';

  const resolved = await resolveDiffInputs(
    { base: 'origin/master', head: '2abc123' },
    async (command, args) => {
      assert.equal(command, 'git');
      if (args[0] === 'rev-parse') {
        const ref = args.at(-1);
        if (ref === 'origin/master^{commit}') return `${canonicalBase}\n`;
        if (ref === '2abc123^{commit}') return `${canonicalHead}\n`;
      }
      if (args[0] === 'diff') {
        assert.deepEqual(args.slice(-2), [canonicalBase, canonicalHead]);
        return diff;
      }
      throw new Error(`unexpected git arguments: ${args.join(' ')}`);
    },
  );

  assert.deepEqual(resolved, {
    baseSha: canonicalBase,
    headSha: canonicalHead,
    rawDiff: diff,
  });
});

test('invalid, ambiguous, and non-commit inputs identify the failed endpoint and stop before diffing', async () => {
  for (const [input, message] of [
    ['missing-ref', 'unknown revision'],
    ['deadbee', 'short object ID is ambiguous'],
    ['blob-object', 'expected commit'],
  ]) {
    let diffCalled = false;
    await assert.rejects(
      resolveDiffInputs(
        { base: input, head: 'HEAD' },
        async (_command, args) => {
          if (args[0] === 'rev-parse' && args.at(-1) === `${input}^{commit}`) {
            throw new Error(message);
          }
          if (args[0] === 'diff') diffCalled = true;
          return `${'2'.repeat(40)}\n`;
        },
      ),
      /Could not resolve base commit/,
    );
    assert.equal(diffCalled, false);
  }

  let diffCalled = false;
  await assert.rejects(
    resolveDiffInputs(
      { base: 'origin/master', head: 'missing-head' },
      async (_command, args) => {
        if (args.at(-1) === 'missing-head^{commit}') {
          throw new Error('unknown revision');
        }
        if (args[0] === 'diff') diffCalled = true;
        return `${'1'.repeat(40)}\n`;
      },
    ),
    (error) => {
      assert.equal(error.message, 'Could not resolve head commit');
      assert.equal(error.cause, undefined);
      return true;
    },
  );
  assert.equal(diffCalled, false);
});

test('malformed resolver output fails closed before diffing', async () => {
  let diffCalled = false;

  await assert.rejects(
    resolveDiffInputs(
      { base: 'malformed-ref', head: 'HEAD' },
      async (_command, args) => {
        if (args[0] === 'rev-parse') return 'not-a-canonical-object-id\n';
        diffCalled = true;
        return '';
      },
    ),
    /Could not resolve base commit/,
  );
  assert.equal(diffCalled, false);
});

test('normalized report inputs use resolved commit IDs, not commit-ish aliases', async () => {
  const canonicalBase = 'a'.repeat(40);
  const canonicalHead = 'b'.repeat(40);
  const resolved = await resolveDiffInputs(
    { base: 'release-base', head: 'HEAD' },
    async (_command, args) => {
      if (args[0] === 'rev-parse') {
        return args.at(-1) === 'release-base^{commit}'
          ? `${canonicalBase}\n`
          : `${canonicalHead}\n`;
      }
      return '';
    },
  );

  const built = buildReport({
    baseSha: resolved.baseSha,
    headSha: resolved.headSha,
    changedFiles: parseUnifiedDiff(resolved.rawDiff),
    surfaces: [],
    baseline: BASELINE,
  });

  assert.equal(built.version, 2);
  assert.equal(built.normalized.baseSha, canonicalBase);
  assert.equal(built.normalized.headSha, canonicalHead);
});

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

  // Absolute prefix is arbitrary on purpose: the matcher only reads the suffix, and the
  // runner's real workspace prefix is homedir-shaped, which secretlint rejects on sight.
  assert.equal(
    matchSourceFile('/build/workspace/repo/apps/app/lib/a.ts', changed),
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

test('observation mode with nothing measured is unmeasured, not an observation', () => {
  // #1849 counts each observation-only report toward `observation.requiredRuns`.
  // A full-suite run skips both changed shards, so the diff has measurable
  // files but no surface instrumented any of them. Publishing that as
  // `observation-only` padded the evidence with empty reports: PRs #4265,
  // #4295 and #4296 each counted with zero measured lines.
  const skipped = report({
    changedFiles: [['apps/app/a.ts', [1, 2]]],
    surfaces: [
      surface('app', 'skipped', null),
      surface('api', 'skipped', null),
    ],
  });

  assert.equal(skipped.normalized.totals.lines.measured, 0);
  assert.equal(skipped.normalized.disposition, 'unmeasured');
  assert.match(formatSummary(skipped), /not an observation/);

  // A clean run whose changed graph pulled in no test file is the same
  // absence of evidence, not a 0% observation.
  const noTests = report({
    changedFiles: [['apps/app/a.ts', [1, 2]]],
    surfaces: [surface('app', 'success', null)],
  });

  assert.equal(noTests.normalized.disposition, 'unmeasured');
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
  assert.match(annotations[0], /changed-code coverage, observation mode/);
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
  assert.equal(BASELINE.observation.evidence.minimumReportVersion, 2);
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

// ── Shard aggregation ───────────────────────────────────────────────────────

test('a surface is only clean when every one of its shards was', () => {
  const clean = [{ outcome: 'success' }, { outcome: 'success' }];
  assert.equal(aggregateSurfaceShards(clean).result, 'success');

  // The exact regression: three shards finish, one overruns its step budget.
  // Publishing that as a pass would report coverage for a suite that only
  // partly ran, understating the uncovered lines in the diff.
  const partial = [
    { outcome: 'success' },
    { outcome: 'failure' },
    { outcome: 'success' },
  ];
  assert.equal(aggregateSurfaceShards(partial).result, 'failure');

  assert.equal(
    aggregateSurfaceShards([{ outcome: 'failure' }, { outcome: 'cancelled' }])
      .result,
    'cancelled',
  );

  // A shard that staged no outcome at all is a failure, never a pass.
  assert.equal(aggregateSurfaceShards([{}]).result, 'failure');
  assert.equal(aggregateSurfaceShards([]).result, null);
});

test('surface latency is the slowest shard, because shards run in parallel', () => {
  // Summing would triple-count parallel work and blow the baseline's
  // `latencyBudgetMinutesP95` on a run that finished comfortably inside it.
  const merged = aggregateSurfaceShards([
    { outcome: 'success', seconds: 240 },
    { outcome: 'success', seconds: 610 },
    { outcome: 'success', seconds: 180 },
  ]);

  assert.equal(merged.latencySeconds, 610);
  assert.equal(
    aggregateSurfaceShards([{ outcome: 'success' }]).latencySeconds,
    null,
  );
});

test('shard lcov reports concatenate into one merged surface report', () => {
  const merged = aggregateSurfaceShards([
    {
      outcome: 'success',
      lcov: 'SF:src/a.ts\nDA:1,1\nDA:2,0\nend_of_record\n',
    },
    {
      outcome: 'success',
      lcov: 'SF:src/a.ts\nDA:1,0\nDA:2,3\nend_of_record\n',
    },
  ]);

  const records = parseLcov(merged.lcov);
  assert.equal(records.size, 1);
  // A line exercised by either shard is covered in the merged surface.
  assert.deepEqual(
    [...records.get('src/a.ts').lines],
    [
      [1, 1],
      [2, 3],
    ],
  );
});

test('a surface root LCOV is paired with child shard outcomes and latency', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'changed-coverage-surface-'));
  try {
    for (const [shard, seconds] of [
      ['shard-1', '120'],
      ['shard-2', '240'],
    ]) {
      const directory = path.join(root, shard);
      mkdirSync(directory);
      writeFileSync(path.join(directory, 'outcome'), 'success\n');
      writeFileSync(path.join(directory, 'seconds'), `${seconds}\n`);
    }
    const lcov = 'SF:src/a.ts\nDA:1,1\nend_of_record\n';
    writeFileSync(path.join(root, 'lcov.info'), lcov);

    const shards = readSurfacePath(root);

    assert.equal(shards.length, 2);
    assert.equal(shards[0].lcov, lcov);
    assert.equal(shards[1].lcov, null);
    assert.deepEqual(aggregateSurfaceShards(shards), {
      latencySeconds: 240,
      lcov,
      result: 'success',
    });
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test('worst-of folds the job result together with the shard outcomes', () => {
  // Step-level continue-on-error leaves the job `success` when a step failed…
  assert.equal(worstResult('success', 'failure'), 'failure');
  // …and a shard killed by the job backstop stages nothing, so only the job
  // result carries the cancellation.
  assert.equal(worstResult('cancelled', 'success'), 'cancelled');
  assert.equal(worstResult('success', 'success'), 'success');
});

// ── Workflow contract ───────────────────────────────────────────────────────

test('the coverage report lives in CI and can never gate a merge', () => {
  assert.ok(
    CI_WORKFLOW.includes('coverage-changed-report:'),
    'ci.yml must define coverage-changed-report:',
  );
  // The standalone instrumented matrix jobs are folded into the changed-test
  // shards (#1969): re-defining them would re-run the same `--changed`
  // selection twice and re-open the ~31% runner-minute duplication.
  assert.equal(CI_WORKFLOW.includes('coverage-changed-app:'), false);
  assert.equal(CI_WORKFLOW.includes('coverage-changed-api:'), false);

  const gate = ciJob('tests-gate');
  assert.equal(
    gate.includes('coverage-changed'),
    false,
    'tests-gate must not depend on the observation-mode report',
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

test('a shard cancelled before its clock started stages no latency', () => {
  // The staging step runs under `if: always()`, so a shard cancelled during
  // its build never reaches "Mark test start" and `COVERAGE_STARTED` is empty.
  // Bash arithmetic then yields the raw epoch: PR #4265 published a
  // 1,788,299,408-second surface latency against a 20-minute budget.
  for (const name of ['test-app-changed', 'test-api-changed']) {
    const job = ciJob(name);
    assert.equal(
      (job.match(/> coverage-shard\/seconds/g) ?? []).length,
      1,
      `${name} stages shard latency exactly once`,
    );
    assert.match(
      job,
      /if \[ -n "\$\{COVERAGE_STARTED:-\}" \]; then\n\s+echo "\$\(\( \$\(date \+%s\) - COVERAGE_STARTED \)\)" > coverage-shard\/seconds\n\s+fi/,
      `${name} must stage latency only after the test clock started`,
    );
  }
});

test('coverage rides the changed-test shards as mergeable blobs on pull requests only', () => {
  // #1969: the standalone coverage matrix re-ran the same `--changed`
  // selection the test shards had just executed — ~31% of CI runner-minutes
  // for a duplicate signal. The fold runs each changed-test shard once,
  // adding v8 instrumentation only on pull requests (pushes and queue runs
  // keep the uninstrumented fast path; the observation report is per-PR).
  for (const [name, surface] of [
    ['test-app-changed', 'app'],
    ['test-api-changed', 'api'],
  ]) {
    const job = ciJob(name);
    assert.match(
      job,
      /WITH_COVERAGE: \$\{\{ github\.event_name == 'pull_request' \}\}/,
      `${name} must instrument pull requests only`,
    );
    assert.match(
      job,
      /if \[ "\$WITH_COVERAGE" = "true" \]/,
      `${name} must branch on the env flag, not the raw event name`,
    );
    assert.match(job, /--reporter=default --reporter=blob/);
    // One slow or red shard must not cancel its siblings and destroy their
    // lcov — and every shard's verdict still reaches the gate individually.
    assert.match(job, /fail-fast: false/, `${name} must not fail fast`);
    assert.match(
      job,
      /--shard=\$\{\{ matrix\.shard \}\}\/\$\{\{ matrix\.total \}\}/,
      `${name} must pass its shard through to vitest`,
    );
    // Each shard stages its own outcome and wall clock: a matrix job's
    // outputs are last-writer-wins across shards.
    assert.match(job, /(?<!\.)coverage-shard\/outcome/);
    assert.match(job, /(?<!\.)coverage-shard\/seconds/);
    assert.match(
      job,
      new RegExp(`changed-code-coverage-blob-${surface}-`),
      `${name} must upload shards under the ${surface} artifact prefix`,
    );
    assert.match(job, /-shard-\$\{\{ matrix\.shard \}\}\n/);
    // A red suite must still ship its lcov and outcome — the observation
    // report needs the failure recorded, not silently absent.
    assert.match(
      job,
      /if: always\(\) && github\.event_name == 'pull_request'/,
      `${name} must stage and upload coverage even when the tests fail`,
    );

    // The staging directory must not be hidden. `upload-artifact` defaults
    // `include-hidden-files: false`, so a leading dot makes it skip every
    // staged file: the shards run green, upload nothing, and the report
    // silently falls back to the job result with no lcov and no latency.
    // Cost one full CI round on #2326 to find.
    assert.doesNotMatch(
      job,
      /path: \./,
      `${name} must stage shards outside the hidden namespace`,
    );
  }
});

test('the report merges blobs and reads each surface as its own shard directory', () => {
  const job = ciJob('coverage-changed-report');

  // The surface result now comes from the folded changed-test jobs — the
  // same jobs that produced the shards being aggregated.
  assert.match(job, /APP_RESULT: \$\{\{ needs\.test-app-changed\.result \}\}/);
  assert.match(job, /API_RESULT: \$\{\{ needs\.test-api-changed\.result \}\}/);

  for (const surface of ['app', 'api']) {
    assert.match(
      job,
      new RegExp(
        `pattern: changed-code-coverage-blob-${surface}-[^\\n]*-shard-\\*`,
      ),
      `report must collect every ${surface} shard`,
    );
    assert.match(
      job,
      new RegExp(
        `--surface "${surface}=\\$\\{${surface.toUpperCase()}_RESULT\\}=\\.changed-coverage/${surface}"`,
      ),
      `report must pass the ${surface} shard directory, not a single lcov`,
    );
  }

  assert.match(job, /bunx vitest --merge-reports \.vitest-reports/);
  assert.match(job, /--coverage\.reporter=lcovonly/);
  assert.match(
    job,
    /merge_surface app apps\/app \.\/vitest\.config\.mts "\$APP_RESULT"/,
  );
  assert.match(
    job,
    /merge_surface api apps\/server\/api vitest\.config\.ts "\$API_RESULT"/,
  );
  assert.match(
    job,
    /PR_NUMBER: \$\{\{ github\.event\.pull_request\.number \}\}/,
  );
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
