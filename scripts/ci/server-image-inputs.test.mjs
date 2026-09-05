import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  SERVER_IMAGE_INPUTS,
  serverImageChanged,
} from './server-image-inputs.mjs';

test('all copied server inputs and build controls belong to the policy', () => {
  for (const input of [
    'skills/**',
    'configs/**',
    'patches/**',
    'webpack.base.config.js',
    'tsconfig.json',
    'tsconfig.server.decorators.json',
    '.dockerignore',
  ]) {
    assert.ok(SERVER_IMAGE_INPUTS.includes(input), input);
  }
});

test('initial pushes build and invalid commit inputs fail closed', () => {
  const head = 'a'.repeat(40);
  assert.equal(serverImageChanged({ head }), true);
  assert.equal(serverImageChanged({ head, base: '0'.repeat(40) }), true);
  assert.throws(() => serverImageChanged({ head: 'master' }), /exact commit/);
  assert.throws(
    () => serverImageChanged({ head, base: '--output=bad' }),
    /exact commit/,
  );
  assert.throws(
    () =>
      serverImageChanged({
        head,
        base: 'b'.repeat(40),
        git: () => {
          throw new Error('missing history');
        },
      }),
    /missing history/,
  );
});

test('real Git changes distinguish image inputs from frontend and documentation', (t) => {
  const cwd = mkdtempSync(path.join(os.tmpdir(), 'server-image-policy-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  git('init', '-q');
  git(
    '-c',
    'user.name=CI Test',
    '-c',
    'user.email=ci@example.invalid',
    '-c',
    'commit.gpgsign=false',
    'commit',
    '--allow-empty',
    '-qm',
    'base',
  );
  const base = git('rev-parse', 'HEAD');
  for (const file of [
    'skills/example/SKILL.md',
    'configs/server.json',
    'patches/dependency.patch',
    'webpack.base.config.js',
    'tsconfig.json',
    '.dockerignore',
    'apps/app/example.tsx',
    'docs/example.md',
  ]) {
    mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
    writeFileSync(path.join(cwd, file), 'changed\n');
    git('add', file);
    git(
      '-c',
      'user.name=CI Test',
      '-c',
      'user.email=ci@example.invalid',
      '-c',
      'commit.gpgsign=false',
      'commit',
      '-qm',
      file,
    );
    const head = git('rev-parse', 'HEAD');
    const previous = git('rev-parse', 'HEAD^');
    assert.equal(
      serverImageChanged({ base: previous, head, cwd }),
      !file.startsWith('apps/app/') && !file.startsWith('docs/'),
      file,
    );
  }
  assert.equal(
    serverImageChanged({ base, head: git('rev-parse', 'HEAD'), cwd }),
    true,
  );
});
