import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  emptyTimings,
  fileSeconds,
  loadTimings,
  MAX_SAMPLES,
  MAX_TIMINGS_AGE_MS,
  median,
  mergeTimings,
  parseTimings,
  weighFiles,
} from './test-timings.mjs';

const SCRIPT = fileURLToPath(new URL('./test-timings.mjs', import.meta.url));
const NOW = Date.parse('2026-11-20T03:37:00Z');

function receipt(files, overrides = {}) {
  return {
    isComplete: true,
    selection: { mode: 'full' },
    runtime: { maxWorkers: 2 },
    candidateFiles: files.map(([file]) => file),
    files: files.map(([file, workMs, state = 'passed']) => ({
      file,
      observedWorkMs: workMs,
      state,
    })),
    ...overrides,
  };
}

function stored(updatedAt, suites) {
  return JSON.stringify({
    schemaVersion: 1,
    updatedAt,
    suites: { app: {}, api: {}, ...suites },
  });
}

test('takes the median of recorded samples', () => {
  assert.equal(median([]), 0);
  assert.equal(median([4]), 4);
  assert.equal(median([9, 1, 5]), 5);
  assert.equal(median([8, 2, 4, 6]), 5);
});

test('turns a worker-summed receipt into seconds of shard wall time', () => {
  assert.equal(
    fileSeconds({ observedWorkMs: 6000 }, { runtime: { maxWorkers: 2 } }),
    3,
  );
  // A receipt without a worker count counts one worker.
  assert.equal(fileSeconds({ observedWorkMs: 6000 }, {}), 6);
});

test('loads the median seconds per file from a fresh file', () => {
  const raw = stored('2026-11-19T03:37:00Z', {
    app: { 'apps/web/a.test.ts': [1, 9, 2] },
    api: { 'apps/server/api/b.spec.ts': [4] },
  });
  const loaded = loadTimings('timings.json', { now: NOW, readFile: () => raw });
  assert.deepEqual([...loaded.app], [['apps/web/a.test.ts', 2]]);
  assert.deepEqual([...loaded.api], [['apps/server/api/b.spec.ts', 4]]);
});

for (const [name, read, file] of [
  [
    'a missing path',
    () => {
      throw new Error('ENOENT');
    },
    'timings.json',
  ],
  ['no path at all', () => '{}', undefined],
  ['text that is not JSON', () => 'not json', 'timings.json'],
  [
    'another schema version',
    () => stored('2026-11-19T03:37:00Z', {}).replace('1,', '2,'),
    'timings.json',
  ],
  [
    'a file older than the age limit',
    () =>
      stored(new Date(NOW - MAX_TIMINGS_AGE_MS - 1).toISOString(), {
        app: { 'apps/web/a.test.ts': [3] },
      }),
    'timings.json',
  ],
  [
    'an updatedAt that is not a date',
    () => stored('yesterday', { app: { 'apps/web/a.test.ts': [3] } }),
    'timings.json',
  ],
]) {
  test(`falls back to no timings for ${name}`, () => {
    const loaded = loadTimings(file, { now: NOW, readFile: read });
    assert.equal(loaded.app.size, 0);
    assert.equal(loaded.api.size, 0);
  });
}

test('drops samples that are not finite seconds', () => {
  const parsed = parseTimings(
    stored('2026-11-19T03:37:00Z', {
      app: {
        'apps/web/ok.test.ts': [2, 3],
        'apps/web/negative.test.ts': [-1],
        'apps/web/text.test.ts': ['3'],
        'apps/web/empty.test.ts': [],
      },
    }),
  );
  assert.deepEqual(Object.keys(parsed.suites.app), ['apps/web/ok.test.ts']);
});

test('weighs a file with no record at the median of the recorded ones', () => {
  const { isTimed, totalSeconds, weights } = weighFiles(
    ['a', 'b', 'c', 'new'],
    new Map([
      ['a', 2],
      ['b', 10],
      ['c', 6],
      ['gone', 100],
    ]),
  );
  assert.equal(isTimed, true);
  // The median of 2, 10, 6 and the unplanned 100 is 8.
  assert.deepEqual(
    [...weights],
    [
      ['a', 2],
      ['b', 10],
      ['c', 6],
      ['new', 8],
    ],
  );
  assert.equal(totalSeconds, 26);
});

for (const [name, files, recorded] of [
  ['no timings', ['a', 'b'], undefined],
  ['an empty record', ['a', 'b'], new Map()],
  ['a record of other files', ['a', 'b'], new Map([['z', 5]])],
  ['fewer than half the files recorded', ['a', 'b', 'c'], new Map([['a', 5]])],
]) {
  test(`weighs every file the same with ${name}`, () => {
    const { isTimed, totalSeconds, weights } = weighFiles(files, recorded);
    assert.equal(isTimed, false);
    assert.equal(totalSeconds, 0);
    assert.deepEqual(
      [...weights],
      files.map((file) => [file, 1]),
    );
  });
}

test('merges one run into the rolling file, one sample per file', () => {
  const merged = mergeTimings(
    null,
    {
      app: [
        receipt([
          ['apps/web/a.test.ts', 4000],
          ['apps/web/b.test.ts', 1000],
        ]),
      ],
      api: [
        receipt([['apps/server/api/a.spec.ts', 8000]]),
        receipt([['apps/server/api/b.spec.ts', 2000]]),
      ],
    },
    { now: NOW },
  );
  assert.equal(merged.updatedAt, '2026-11-20T03:37:00.000Z');
  assert.deepEqual(merged.suites.app, {
    'apps/web/a.test.ts': [2],
    'apps/web/b.test.ts': [0.5],
  });
  assert.deepEqual(merged.suites.api, {
    'apps/server/api/a.spec.ts': [4],
    'apps/server/api/b.spec.ts': [1],
  });
});

test('keeps the last samples per file and leaves an absent suite alone', () => {
  let timings = emptyTimings();
  for (let run = 1; run <= MAX_SAMPLES + 2; run += 1) {
    timings = mergeTimings(
      timings,
      { app: [receipt([['apps/web/a.test.ts', run * 2000]])], api: [] },
      { now: NOW },
    );
  }
  assert.deepEqual(timings.suites.app['apps/web/a.test.ts'], [3, 4, 5, 6, 7]);
  assert.deepEqual(timings.suites.api, {});
});

test('skips failed files and incomplete receipts', () => {
  const merged = mergeTimings(
    null,
    {
      app: [
        receipt(
          [
            ['apps/web/ok.test.ts', 2000],
            ['apps/web/failed.test.ts', 90000, 'failed'],
          ],
          {},
        ),
        receipt([['apps/web/killed.test.ts', 5000]], { isComplete: false }),
      ],
      api: [],
    },
    { now: NOW },
  );
  assert.deepEqual(Object.keys(merged.suites.app), ['apps/web/ok.test.ts']);
});

test('a full run drops the files no shard lists any more, a partial one does not', () => {
  const previous = parseTimings(
    stored('2026-11-19T03:37:00Z', {
      app: { 'apps/web/deleted.test.ts': [3], 'apps/web/a.test.ts': [3] },
    }),
  );
  const full = mergeTimings(
    structuredClone(previous),
    { app: [receipt([['apps/web/a.test.ts', 2000]])], api: [] },
    { now: NOW },
  );
  assert.deepEqual(Object.keys(full.suites.app), ['apps/web/a.test.ts']);

  const affected = mergeTimings(
    structuredClone(previous),
    {
      app: [
        receipt([['apps/web/a.test.ts', 2000]], {
          selection: { mode: 'affected' },
        }),
      ],
      api: [],
    },
    { now: NOW },
  );
  assert.deepEqual(Object.keys(affected.suites.app).sort(), [
    'apps/web/a.test.ts',
    'apps/web/deleted.test.ts',
  ]);
});

test('the merge command folds receipt folders into the file the planner reads', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'test-timings-'));
  try {
    mkdirSync(path.join(directory, 'app', 'app-test-timings-1-1-1'), {
      recursive: true,
    });
    mkdirSync(path.join(directory, 'api', 'api-test-timings-1-1-1'), {
      recursive: true,
    });
    writeFileSync(
      path.join(directory, 'app', 'app-test-timings-1-1-1', 'shard-1.json'),
      JSON.stringify(receipt([['apps/web/a.test.ts', 6000]])),
    );
    writeFileSync(
      path.join(directory, 'api', 'api-test-timings-1-1-1', 'shard-1.json'),
      JSON.stringify(receipt([['apps/server/api/a.spec.ts', 10000]])),
    );
    const out = path.join(directory, 'out', 'test-timings.json');
    const result = spawnSync(
      process.execPath,
      [
        SCRIPT,
        'merge',
        '--app',
        path.join(directory, 'app'),
        '--api',
        path.join(directory, 'api'),
        '--out',
        out,
      ],
      { encoding: 'utf8' },
    );
    assert.equal(result.status, 0, result.stderr);

    const loaded = loadTimings(out);
    assert.deepEqual([...loaded.app], [['apps/web/a.test.ts', 3]]);
    assert.deepEqual([...loaded.api], [['apps/server/api/a.spec.ts', 5]]);
    assert.match(readFileSync(out, 'utf8'), /"schemaVersion":1/);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});
