import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { awaitChildResult } from './cpu-profile-child-result.mjs';

function fixtureChild(t, source) {
  const directory = mkdtempSync(join(tmpdir(), 'cpu-child-result-'));
  t.after(() => rmSync(directory, { force: true, recursive: true }));
  const file = join(directory, 'child.mjs');
  writeFileSync(file, source);
  return fork(file, [], { stdio: ['ignore', 'ignore', 'pipe', 'ipc'] });
}

test('a child that fails before sending a result reports its exit status and complete stderr', async (t) => {
  // A write larger than the pipe buffer, flushed as the process exits, is the
  // case where `exit` can fire before the last of stderr has been read.
  const child = fixtureChild(
    t,
    `process.stderr.write('first line\\n' + 'x'.repeat(200000) + '\\nlast line\\n', () => process.exit(3));`,
  );

  await assert.rejects(
    awaitChildResult(child, { watchdogMs: 15000 }),
    (error) => {
      assert.match(error.message, /exit 3/);
      assert.match(error.message, /first line/);
      assert.match(error.message, /last line\n$/);
      return true;
    },
  );
});

test('a child that sends its result resolves it and leaves no watchdog behind', async (t) => {
  const child = fixtureChild(
    t,
    `process.send({ sealedWhileBusy: true }, () => process.disconnect());`,
  );

  assert.deepEqual(await awaitChildResult(child, { watchdogMs: 15000 }), {
    sealedWhileBusy: true,
  });
});

test('a child that never answers is killed by the watchdog', async (t) => {
  const child = fixtureChild(t, `setInterval(() => {}, 1000);`);

  await assert.rejects(
    awaitChildResult(child, { watchdogMs: 300 }),
    /exceeded child watchdog/,
  );
});
