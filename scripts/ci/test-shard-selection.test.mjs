import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { selectShardArguments } from './test-shard-selection.mjs';

const SCRIPT = fileURLToPath(
  new URL('./test-shard-selection.mjs', import.meta.url),
);

const shard = {
  fileExists: () => true,
  repositoryRoot: '/repo',
  shard: '2',
  suiteRoot: 'apps/web',
  total: '4',
};

test('runs the files the plan gave the shard, without a Vitest shard', () => {
  assert.deepEqual(
    selectShardArguments({
      ...shard,
      base: 'base-sha',
      count: '3',
      files:
        'src/a.test.tsx\nsrc/app/(protected)/[id]/b.test.tsx\n../../packages/ui/src/c.test.tsx',
    }),
    {
      args: [
        '/repo/apps/web/src/a.test.tsx',
        '/repo/apps/web/src/app/(protected)/[id]/b.test.tsx',
        '/repo/packages/ui/src/c.test.tsx',
      ],
      mode: 'files',
    },
  );
});

test('runs the whole suite split by Vitest on the full tier and without a base', () => {
  assert.deepEqual(
    selectShardArguments({
      ...shard,
      base: 'base-sha',
      count: '1',
      files: 'src/a.test.tsx',
      forceFull: true,
    }),
    { args: ['--shard=2/4'], mode: 'full' },
  );
  assert.deepEqual(selectShardArguments({ ...shard, base: '' }), {
    args: ['--shard=2/4'],
    mode: 'full',
  });
});

test('resolves the changed graph itself only when the plan carried no list', () => {
  assert.deepEqual(selectShardArguments({ ...shard, base: 'base-sha' }), {
    args: ['--passWithNoTests', '--changed', 'base-sha', '--shard=2/4'],
    mode: 'changed',
  });
});

test('fails the shard when a carried list cannot be used', () => {
  assert.throws(
    () =>
      selectShardArguments({
        ...shard,
        base: 'base-sha',
        count: '3',
        files: 'src/a.test.tsx\nsrc/b.test.tsx',
      }),
    /The plan counted 3 files and the list holds 2/,
  );
  assert.throws(
    () =>
      selectShardArguments({
        ...shard,
        base: 'base-sha',
        files: 'src/a.test.tsx',
      }),
    /The plan counted no files and the list holds 1/,
  );
  assert.throws(
    () => selectShardArguments({ ...shard, base: 'base-sha', count: '2' }),
    /The plan counted 2 files and listed none/,
  );
  assert.throws(
    () =>
      selectShardArguments({
        ...shard,
        base: 'base-sha',
        count: '1',
        files: '../../../outside.test.ts',
      }),
    /Planned file \.\.\/\.\.\/\.\.\/outside\.test\.ts is outside the repository/,
  );
  assert.throws(
    () =>
      selectShardArguments({
        ...shard,
        base: 'base-sha',
        count: '1',
        fileExists: () => false,
        files: 'src/gone.test.tsx',
      }),
    /Planned file src\/gone\.test\.tsx is not in this checkout/,
  );
});

test('rejects a shard position the matrix could not have produced', () => {
  assert.throws(
    () => selectShardArguments({ ...shard, shard: '' }),
    /SHARD and SHARD_TOTAL must be positive integers/,
  );
  assert.throws(
    () => selectShardArguments({ ...shard, total: '0' }),
    /SHARD and SHARD_TOTAL must be positive integers/,
  );
  assert.throws(
    () => selectShardArguments({ ...shard, shard: '5' }),
    /SHARD must not exceed SHARD_TOTAL/,
  );
  assert.throws(
    () => selectShardArguments({ ...shard, suiteRoot: '' }),
    /SHARD_ROOT is required/,
  );
});

test('the command prints one argument per line and explains its choice', () => {
  const root = realpathSync(
    mkdtempSync(path.join(tmpdir(), 'shard-selection-')),
  );
  try {
    mkdirSync(path.join(root, 'scripts/ci'), { recursive: true });
    mkdirSync(path.join(root, 'apps/web/src/app/(protected)'), {
      recursive: true,
    });
    const script = path.join(root, 'scripts/ci/test-shard-selection.mjs');
    copyFileSync(SCRIPT, script);
    writeFileSync(path.join(root, 'apps/web/src/a.test.tsx'), '');
    writeFileSync(
      path.join(root, 'apps/web/src/app/(protected)/b c.test.tsx'),
      '',
    );
    const run = (env) =>
      spawnSync(process.execPath, [script], {
        encoding: 'utf8',
        env: {
          PATH: process.env.PATH,
          SHARD: '1',
          SHARD_ROOT: 'apps/web',
          SHARD_TOTAL: '2',
          ...env,
        },
      });

    const listed = run({
      CI_BASE_SHA: 'base-sha',
      FORCE_FULL: 'false',
      SHARD_FILE_COUNT: '2',
      SHARD_FILES: 'src/a.test.tsx\nsrc/app/(protected)/b c.test.tsx',
    });
    assert.equal(listed.status, 0);
    assert.equal(
      listed.stdout,
      `${path.join(root, 'apps/web/src/a.test.tsx')}\n${path.join(root, 'apps/web/src/app/(protected)/b c.test.tsx')}\n`,
    );
    assert.equal(
      listed.stderr,
      'Running the 2 test files the plan gave this shard\n',
    );

    const stale = run({
      CI_BASE_SHA: 'base-sha',
      SHARD_FILE_COUNT: '1',
      SHARD_FILES: 'src/missing.test.tsx',
    });
    assert.equal(stale.status, 1);
    assert.equal(stale.stdout, '');
    assert.equal(
      stale.stderr,
      '::error::Planned file src/missing.test.tsx is not in this checkout\n',
    );

    const unlisted = run({ CI_BASE_SHA: 'base-sha' });
    assert.equal(unlisted.status, 0);
    assert.equal(
      unlisted.stdout,
      '--passWithNoTests\n--changed\nbase-sha\n--shard=1/2\n',
    );
    assert.equal(
      unlisted.stderr,
      'The plan carried no file list; resolving the changed graph in the shard\n',
    );

    const full = run({ CI_BASE_SHA: 'base-sha', FORCE_FULL: 'true' });
    assert.equal(full.status, 0);
    assert.equal(full.stdout, '--shard=1/2\n');
    assert.equal(full.stderr, 'Running the whole suite, split by Vitest\n');

    const invalid = run({ SHARD: '3' });
    assert.equal(invalid.status, 1);
    assert.equal(invalid.stdout, '');
    assert.equal(
      invalid.stderr,
      '::error::SHARD must not exceed SHARD_TOTAL\n',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
