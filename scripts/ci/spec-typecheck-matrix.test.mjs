import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { buildSpecTypecheckMatrix } from './spec-typecheck-matrix.mjs';

const SCRIPT = fileURLToPath(
  new URL('./spec-typecheck-matrix.mjs', import.meta.url),
);

test('caps heavy runner demand at three deterministic balanced pools', () => {
  const workspaces = [
    'api',
    'workers',
    'app',
    'agent',
    'props',
    'hooks',
    'pages',
    'ui',
    'utils',
  ];
  const matrix = buildSpecTypecheckMatrix({ workspaces });
  assert.equal(matrix.include.length, 3);
  assert.deepEqual(
    matrix,
    buildSpecTypecheckMatrix({ workspaces: [...workspaces].reverse() }),
  );
  assert.deepEqual(
    matrix.include.flatMap((leg) => leg.workspaces.split(' ')).sort(),
    workspaces.sort(),
  );
  for (const leg of matrix.include)
    assert.ok(leg.workspaces.split(' ').length >= 2);
});

test('uses one pool for light scope, dedupes, validates names and handles empty scope', () => {
  assert.deepEqual(buildSpecTypecheckMatrix({ workspaces: [] }).include, []);
  assert.deepEqual(
    buildSpecTypecheckMatrix({ workspaces: ['api', 'api'] }).include,
    [{ name: 'pool-1', workspaces: 'api' }],
  );
  assert.deepEqual(buildSpecTypecheckMatrix({ workspaces: ['app'] }).include, [
    { name: 'pool-1', workspaces: 'app' },
  ]);
  assert.throws(
    () => buildSpecTypecheckMatrix({ workspaces: ['api;exit'] }),
    /Invalid/,
  );
  const heavy = buildSpecTypecheckMatrix({
    workspaces: ['future', 'app'],
    soloWorkspaces: ['future'],
  });
  assert.equal(heavy.include.length, 2);
});

test('writes run and matrix outputs for the workflow', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'spec-matrix-'));
  const output = path.join(directory, 'output');

  try {
    for (const [scoped, expectedRun] of [
      ['api app', 'true'],
      ['', 'false'],
    ]) {
      execFileSync('node', [SCRIPT], {
        env: {
          ...process.env,
          GITHUB_OUTPUT: output,
          SCOPED_WORKSPACES: scoped,
          SOLO_WORKSPACES: 'app',
        },
      });
      const lines = readFileSync(output, 'utf8').trim().split('\n');
      const run = lines.at(-2);
      const matrix = JSON.parse(lines.at(-1).slice('matrix='.length));

      assert.equal(run, `run=${expectedRun}`);
      assert.equal(matrix.include.length > 0, expectedRun === 'true');
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
