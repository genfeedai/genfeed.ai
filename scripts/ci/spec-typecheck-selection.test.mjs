import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { selectSpecTypecheckWorkspaces } from './spec-typecheck-selection.mjs';

const require = createRequire(
  new URL('../../apps/server/api/package.json', import.meta.url),
);
const { parse } = require('yaml');

const SCRIPT = fileURLToPath(
  new URL('./spec-typecheck-selection.mjs', import.meta.url),
);
const validationJobs = parse(
  readFileSync(
    fileURLToPath(
      new URL('../../.github/workflows/_ci-validation.yml', import.meta.url),
    ),
    'utf8',
  ),
).jobs;

function runSelection(t, scopedWorkspaces) {
  const directory = mkdtempSync(path.join(tmpdir(), 'spec-selection-'));
  t.after(() => rmSync(directory, { force: true, recursive: true }));
  const output = path.join(directory, 'output');
  const result = spawnSync(process.execPath, [SCRIPT], {
    encoding: 'utf8',
    env: {
      ...process.env,
      GITHUB_OUTPUT: output,
      SCOPED_WORKSPACES: scopedWorkspaces,
    },
  });
  return { output, result };
}

test('keeps every selected workspace once, in a stable order', () => {
  assert.deepEqual(
    selectSpecTypecheckWorkspaces(['web', 'api', 'ui', 'api', 'agent']),
    ['agent', 'api', 'ui', 'web'],
  );
});

test('selects nothing for an empty scope', () => {
  assert.deepEqual(selectSpecTypecheckWorkspaces([]), []);
});

test('refuses a name that is not a workspace directory name', () => {
  assert.throws(
    () => selectSpecTypecheckWorkspaces(['api', 'api;exit']),
    /Invalid spec workspace name/,
  );
});

test('writes the whole scope as one job input', (t) => {
  const { output, result } = runSelection(t, 'web  api\tui api');

  assert.equal(result.status, 0);
  assert.equal(
    readFileSync(output, 'utf8'),
    'run=true\nworkspaces=api ui web\n',
  );
  assert.equal(result.stdout, 'Spec typecheck workspaces: api ui web\n');
});

test('skips the job when nothing is in scope', (t) => {
  const { output, result } = runSelection(t, '');

  assert.equal(result.status, 0);
  assert.equal(readFileSync(output, 'utf8'), 'run=false\nworkspaces=\n');
  assert.equal(result.stdout, 'Spec typecheck: nothing in scope\n');
});

test('fails the Plan job on an invalid name instead of writing an output', (t) => {
  const { result } = runSelection(t, 'api run=true');

  assert.equal(result.status, 1);
  assert.equal(result.stderr, 'Invalid spec workspace name\n');
});

test('the Plan job publishes the selection and the scope it came from', () => {
  const { outputs, steps } = validationJobs.plan;
  const selection = steps.find((step) => step.id === 'spec-selection');

  assert.equal(outputs.spec_run, '${{ steps.spec-selection.outputs.run }}');
  assert.equal(
    outputs.spec_workspaces,
    '${{ steps.spec-selection.outputs.workspaces }}',
  );
  assert.equal(outputs.spec_matrix, undefined);
  assert.equal(selection.run, 'node scripts/ci/spec-typecheck-selection.mjs');
  assert.deepEqual(selection.env, {
    SCOPED_WORKSPACES:
      '${{ steps.turbo-scope.outputs.workspaces || steps.scope.outputs.workspaces }}',
  });
});

test('one Spec Typecheck job checks the whole selection', () => {
  const job = validationJobs['spec-typecheck'];
  const check = job.steps.find((step) => step.name === 'Spec Typecheck');

  assert.equal(job.name, 'Spec Typecheck');
  assert.equal(job.strategy, undefined);
  // The job starts with the run and reads the Plan job's scope through the
  // start action; it does nothing when the plan puts no workspace in scope.
  assert.equal(job.needs, undefined);
  assert.equal(check.if, "steps.start.outputs.run == 'true'");
  assert.deepEqual(check.env, {
    SCOPED_WORKSPACES:
      '${{ fromJSON(steps.start.outputs.plan).spec_workspaces }}',
  });
  assert.equal(check.run, 'bun run check:spec-typecheck ${SCOPED_WORKSPACES}');
});
