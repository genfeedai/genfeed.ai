import assert from 'node:assert/strict';
import test from 'node:test';

import {
  analyzeTurboLog,
  checkTurboRemoteCache,
} from './check-turbo-remote-cache.mjs';

const LIVE_LOG = [
  '• Packages in scope: @genfeedai/contracts, @genfeedai/prisma',
  '• Running type-check in 2 packages',
  '• Remote caching enabled',
  'Tasks:    2 successful, 2 total',
].join('\n');

function collect() {
  const lines = [];
  return { lines, write: (line) => lines.push(line) };
}

test('reads a live remote cache from the turbo banner', () => {
  assert.equal(analyzeTurboLog(LIVE_LOG).status, 'live');
});

test('reports the rejected-token shape that exits zero', () => {
  const result = analyzeTurboLog(
    'WARNING  failed to contact remote cache: Cache error: unauthorized\nTasks:    2 successful, 2 total',
  );
  assert.equal(result.status, 'dead');
  assert.match(result.detail, /failed to contact remote cache/);
});

test('treats a silent log as unverified rather than live', () => {
  assert.equal(
    analyzeTurboLog('Tasks:    2 successful, 2 total').status,
    'unverified',
  );
});

test('a dead cache annotates as an error without claiming a build failure', () => {
  const { lines, write } = collect();
  const result = checkTurboRemoteCache({
    logPath: 'turbo.log',
    token: 'secret',
    readLog: () => 'WARNING  remote caching disabled',
    write,
  });

  assert.equal(result.isDead, true);
  assert.match(lines[0], /^::error::Turbo remote cache is not usable/);
  assert.match(lines[0], /Rotate TURBO_TOKEN/);
});

// The step that runs this is `continue-on-error`. Nothing below a dead cache
// may ever be reported as dead: an unreadable log, a missing path, or a repo
// with no token configured are all "unknown", never "broken".
test('unknown states stay non-fatal', () => {
  for (const options of [
    { token: '', logPath: 'turbo.log' },
    { token: 'secret', logPath: undefined },
    {
      token: 'secret',
      logPath: 'missing.log',
      readLog: () => {
        throw new Error('ENOENT');
      },
    },
  ]) {
    const { lines, write } = collect();
    const result = checkTurboRemoteCache({ ...options, write });
    assert.equal(result.isDead, false);
    assert.doesNotMatch(lines.join('\n'), /::error::/);
  }
});

test('a live cache stays quiet', () => {
  const { lines, write } = collect();
  const result = checkTurboRemoteCache({
    logPath: 'turbo.log',
    token: 'secret',
    readLog: () => LIVE_LOG,
    write,
  });

  assert.equal(result.status, 'live');
  assert.doesNotMatch(lines.join('\n'), /::(?:error|warning)::/);
});
