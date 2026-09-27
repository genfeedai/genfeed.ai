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

test('gives each solo workspace its own leg and shares the rest', () => {
  const matrix = buildSpecTypecheckMatrix({
    workspaces: ['api', 'app', 'workers', 'props', 'utils'],
    soloWorkspaces: ['app', 'agent', 'props'],
  });

  assert.deepEqual(matrix.include, [
    { name: 'app', workspaces: 'app' },
    { name: 'props', workspaces: 'props' },
    { name: 'shared', workspaces: 'api workers utils' },
  ]);
});

test('omits the shared leg when only solo workspaces are in scope', () => {
  const matrix = buildSpecTypecheckMatrix({
    workspaces: ['app'],
    soloWorkspaces: ['app'],
  });

  assert.deepEqual(matrix.include, [{ name: 'app', workspaces: 'app' }]);
});

test('emits no legs for an empty scope and dedupes repeated workspaces', () => {
  assert.deepEqual(
    buildSpecTypecheckMatrix({ workspaces: [], soloWorkspaces: ['app'] })
      .include,
    [],
  );
  assert.deepEqual(
    buildSpecTypecheckMatrix({
      workspaces: ['api', 'api'],
      soloWorkspaces: [],
    }).include,
    [{ name: 'shared', workspaces: 'api' }],
  );
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
