import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPackageTestMatrix } from './workspace-test-matrix.mjs';

const tasks = [
  '@genfeedai/ui#test',
  '@genfeedai/pages#test',
  '@genfeedai/agent#test',
  '@genfeedai/workflows#test',
  '@genfeedai/hooks#test',
  '@genfeedai/contracts#test',
  '@genfeedai/utils#test',
];

test('balances every selected package exactly once and partitions UI across four legs', () => {
  const legs = buildPackageTestMatrix(tasks);
  assert.equal(legs.length, 4);
  const selected = legs
    .flatMap((leg) =>
      leg.filters
        .split(' ')
        .filter(Boolean)
        .map((filter) => `${filter.replace('--filter=', '')}#test`),
    )
    .sort();
  assert.deepEqual(
    selected,
    tasks.filter((task) => task !== '@genfeedai/ui#test').sort(),
  );
  assert.deepEqual(
    legs.map((leg) => leg.ui_shard),
    ['1/4', '2/4', '3/4', '4/4'],
  );
  assert.equal(new Set(legs.map((leg) => leg.name)).size, legs.length);
  assert.deepEqual(buildPackageTestMatrix([...tasks].reverse()), legs);
});

test('keeps small plans small and never adds tests to the authoritative selection', () => {
  assert.deepEqual(buildPackageTestMatrix([]), []);
  const legs = buildPackageTestMatrix([
    '@genfeedai/contracts#test',
    '@genfeedai/contracts#test',
  ]);
  assert.equal(legs.length, 1);
  assert.equal(legs[0].filters, '--filter=@genfeedai/contracts');
  assert.equal(legs[0].ui_shard, '');
  assert.equal(buildPackageTestMatrix(['@genfeedai/ui#test']).length, 4);
});

test('rejects malformed or non-package task IDs instead of constructing shell commands', () => {
  for (const task of [
    '@genfeedai/ui#build',
    '@genfeedai/ui;echo#test',
    'api#test',
    '@genfeedai/../ui#test',
  ])
    assert.throws(
      () => buildPackageTestMatrix([task]),
      /Invalid package test task/,
    );
});
