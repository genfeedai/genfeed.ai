import assert from 'node:assert/strict';
import test from 'node:test';
import { buildWorkspaceTestMatrix } from './workspace-test-matrix.mjs';

const tasks = [
  '@genfeedai/ui#test',
  '@genfeedai/agent#test',
  '@genfeedai/workflows#test',
  '@genfeedai/hooks#test',
  '@genfeedai/contracts#test',
  '@genfeedai/utils#test',
];
const WEB = '--filter=@genfeedai/marketing --filter=@genfeedai/docs';
const SERVER = '--filter=./apps/server/* --filter=!@genfeedai/api';

function filtersOf(legs) {
  return legs.flatMap((leg) => leg.filters.split(' ').filter(Boolean)).sort();
}

test('balances every selected package exactly once and partitions UI across four legs', () => {
  const legs = buildWorkspaceTestMatrix({ packageTasks: tasks });
  assert.equal(legs.length, 4);
  assert.deepEqual(
    filtersOf(legs),
    tasks
      .filter((task) => task !== '@genfeedai/ui#test')
      .map((task) => `--filter=${task.slice(0, -'#test'.length)}`)
      .sort(),
  );
  assert.deepEqual(
    legs.map((leg) => leg.ui_shard),
    ['1/4', '2/4', '3/4', '4/4'],
  );
  assert.equal(new Set(legs.map((leg) => leg.name)).size, legs.length);
  assert.deepEqual(
    buildWorkspaceTestMatrix({ packageTasks: [...tasks].reverse() }),
    legs,
  );
});

test('keeps small plans small and never adds tests to the authoritative selection', () => {
  assert.deepEqual(buildWorkspaceTestMatrix({ packageTasks: [] }), []);
  assert.deepEqual(
    buildWorkspaceTestMatrix({
      packageTasks: ['@genfeedai/contracts#test', '@genfeedai/contracts#test'],
    }),
    [
      {
        group: 'workspaces',
        name: 'workspaces-1/1',
        filters: '--filter=@genfeedai/contracts',
        extension: '',
        ui_shard: '',
      },
    ],
  );
  assert.equal(
    buildWorkspaceTestMatrix({ packageTasks: ['@genfeedai/ui#test'] }).length,
    4,
  );
});

test('web and the extension share a leg with packages instead of owning runners', () => {
  const legs = buildWorkspaceTestMatrix({
    packageTasks: tasks.filter((task) => task !== '@genfeedai/ui#test'),
    serverFilters: SERVER,
    webFilters: WEB,
    browserExtension: true,
  });
  // The server leg owns the workers cron and MCP e2e steps; the rest fit three
  // legs, so a full run needs one wave of four runners, not seven.
  assert.deepEqual(
    legs.map((leg) => leg.name),
    ['workspaces-1/3', 'workspaces-2/3', 'workspaces-3/3', 'server'],
  );
  assert.deepEqual(
    filtersOf(legs.filter((leg) => leg.group === 'workspaces')),
    [
      '--filter=@genfeedai/agent',
      '--filter=@genfeedai/contracts',
      '--filter=@genfeedai/docs',
      '--filter=@genfeedai/hooks',
      '--filter=@genfeedai/marketing',
      '--filter=@genfeedai/utils',
      '--filter=@genfeedai/workflows',
    ],
  );
  assert.equal(legs.filter((leg) => leg.extension === 'true').length, 1);
  assert.deepEqual(legs.at(-1), {
    group: 'server',
    name: 'server',
    filters: SERVER,
    extension: '',
    ui_shard: '',
  });
});

test('web and the extension alone still get exactly one leg each of work', () => {
  assert.deepEqual(
    buildWorkspaceTestMatrix({
      packageTasks: [],
      webFilters: WEB,
      browserExtension: true,
    }),
    [
      {
        group: 'workspaces',
        name: 'workspaces-1/1',
        filters: WEB,
        extension: 'true',
        ui_shard: '',
      },
    ],
  );
  assert.deepEqual(
    buildWorkspaceTestMatrix({ packageTasks: [], serverFilters: SERVER }),
    [
      {
        group: 'server',
        name: 'server',
        filters: SERVER,
        extension: '',
        ui_shard: '',
      },
    ],
  );
});

test('UI shards keep four distinct legs and still carry web and the extension', () => {
  const legs = buildWorkspaceTestMatrix({
    packageTasks: ['@genfeedai/ui#test', '@genfeedai/contracts#test'],
    webFilters: WEB,
    browserExtension: true,
  });
  assert.equal(legs.length, 4);
  assert.deepEqual(
    legs.map((leg) => leg.ui_shard),
    ['1/4', '2/4', '3/4', '4/4'],
  );
  assert.equal(legs.filter((leg) => leg.extension === 'true').length, 1);
  assert.deepEqual(filtersOf(legs), [
    '--filter=@genfeedai/contracts',
    '--filter=@genfeedai/docs',
    '--filter=@genfeedai/marketing',
  ]);
});

test('rejects malformed or non-package task IDs instead of constructing shell commands', () => {
  for (const task of [
    '@genfeedai/ui#build',
    '@genfeedai/ui;echo#test',
    'api#test',
    '@genfeedai/../ui#test',
  ])
    assert.throws(
      () => buildWorkspaceTestMatrix({ packageTasks: [task] }),
      /Invalid package test task/,
    );
});
