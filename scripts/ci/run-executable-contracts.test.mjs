import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  isPassed,
  readContractCommands,
  runCommandsConcurrently,
} from './run-executable-contracts.mjs';

const REPOSITORY_ROOT = fileURLToPath(new URL('../..', import.meta.url));

// Each command waits for a marker the other command writes, so the pair only
// finishes when both run at the same time. Serial execution would time out.
const RENDEZVOUS_SCRIPT = [
  "const fs = require('node:fs');",
  "const path = require('node:path');",
  'const [directory, mine, theirs] = process.argv.slice(2);',
  "fs.writeFileSync(path.join(directory, mine), '1');",
  'const deadline = Date.now() + 15000;',
  'while (!fs.existsSync(path.join(directory, theirs))) {',
  '  if (Date.now() > deadline) process.exit(3);',
  '}',
].join('\n');

function rendezvous(directory, mine, theirs) {
  const script = path.join(directory, 'rendezvous.cjs');
  writeFileSync(script, RENDEZVOUS_SCRIPT);
  return `node "${script}" "${directory}" ${mine} ${theirs}`;
}

test('runs the commands side by side', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'contracts-'));
  try {
    const results = await runCommandsConcurrently(
      [rendezvous(directory, 'a', 'b'), rendezvous(directory, 'b', 'a')],
      { concurrency: 2 },
    );
    assert.deepEqual(results.map(isPassed), [true, true]);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test('a failing command never hides the others and results keep input order', async () => {
  const results = await runCommandsConcurrently(
    [
      `node -e "console.log('first')"`,
      `node -e "console.error('boom'); process.exit(7)"`,
      `node -e "console.log('third')"`,
    ],
    { concurrency: 2 },
  );
  assert.deepEqual(
    results.map((result) => [isPassed(result), result.exitCode]),
    [
      [true, 0],
      [false, 7],
      [true, 0],
    ],
  );
  assert.match(results[0].output, /first/);
  assert.match(results[1].output, /boom/);
  assert.match(results[2].output, /third/);
});

test('a signalled command is a failure', async () => {
  const [result] = await runCommandsConcurrently([
    `node -e "process.kill(process.pid, 'SIGKILL')"`,
  ]);
  assert.equal(isPassed(result), false);
});

test('reads the executable contract list from the root package script', () => {
  const commands = readContractCommands(
    path.join(REPOSITORY_ROOT, 'package.json'),
  );
  assert.ok(commands.length > 5);
  assert.ok(
    commands.some((command) =>
      command.includes('scripts/ci/run-executable-contracts.test.mjs'),
    ),
    'this runner test must stay in the executable contract list',
  );
  for (const command of commands) {
    assert.doesNotMatch(command, /&&/);
  }
});

test('rejects a manifest without the script', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'contracts-'));
  try {
    const manifest = path.join(directory, 'package.json');
    writeFileSync(manifest, JSON.stringify({ scripts: {} }));
    assert.throws(() => readContractCommands(manifest), /no test:executable/);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});
