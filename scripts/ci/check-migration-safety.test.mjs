import assert from 'node:assert/strict';
import test from 'node:test';
import {
  changedMigrationFiles,
  checkMigrationFiles,
} from './check-migration-safety.mjs';

const dir = 'packages/prisma/prisma/migrations';
const check = (sqlByFile) =>
  checkMigrationFiles({
    files: Object.keys(sqlByFile),
    read: (file) => sqlByFile[file],
  });

test('fails a migration with dynamic EXECUTE, naming the file and operation', () => {
  const file = `${dir}/20260101_dyn/migration.sql`;
  const failures = check({
    [file]: 'DO $$ BEGIN EXECUTE \'DROP TABLE "examples"\'; END $$;',
  });
  assert.equal(failures.length, 1);
  assert.equal(failures[0].file, file);
  assert.match(failures[0].message, /Dynamic EXECUTE/);
});

test('passes CREATE TRIGGER ... EXECUTE FUNCTION', () => {
  const failures = check({
    [`${dir}/20260101_trg/migration.sql`]:
      'CREATE TRIGGER "t" BEFORE INSERT ON "x" FOR EACH ROW EXECUTE FUNCTION "f"();',
  });
  assert.deepEqual(failures, []);
});

test('fails destructive SQL without a contract marker', () => {
  const failures = check({
    [`${dir}/20260101_drop/migration.sql`]: 'DROP TABLE "examples";',
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0].message, /genfeed-contract-after/);
});

test('scans only migrations changed against the base', () => {
  const calls = [];
  const git = (args) => {
    calls.push(args);
    if (args[0] === 'rev-parse') return 'abc';
    return [
      `${dir}/20260102_new/migration.sql`,
      `${dir}/migration_lock.toml`,
    ].join('\n');
  };
  const files = changedMigrationFiles({ base: 'origin/master', git });
  assert.deepEqual(files, [`${dir}/20260102_new/migration.sql`]);
  const diff = calls.find((args) => args[0] === 'diff');
  assert.ok(diff.includes('origin/master...HEAD'));
});

test('fails closed when the base cannot be resolved', () => {
  const git = () => {
    throw new Error('bad revision');
  };
  assert.throws(
    () => changedMigrationFiles({ base: 'deadbeef', env: {}, git }),
    /Cannot resolve migration diff base/,
  );
});

test('fails closed when the diff fails (no merge base)', () => {
  const git = (args) => {
    if (args[0] === 'diff') throw new Error('no merge base');
    return 'abc';
  };
  assert.throws(
    () => changedMigrationFiles({ base: 'abc', env: {}, git }),
    /git diff abc\.\.\.HEAD failed/,
  );
});

test('a multi-commit range scans every changed migration', () => {
  const git = (args) =>
    args[0] === 'diff'
      ? [
          `${dir}/20260101_a/migration.sql`,
          `${dir}/20260102_b/migration.sql`,
        ].join('\n')
      : 'abc';
  assert.deepEqual(changedMigrationFiles({ base: 'abc', env: {}, git }), [
    `${dir}/20260101_a/migration.sql`,
    `${dir}/20260102_b/migration.sql`,
  ]);
});

test('no requested base is an explicit skip, not a verified pass', () => {
  assert.equal(changedMigrationFiles({ env: {}, git: () => '' }), null);
});

test('CI_BASE_SHA is used when no --base is given', () => {
  const calls = [];
  const git = (args) => {
    calls.push(args);
    return '';
  };
  changedMigrationFiles({ env: { CI_BASE_SHA: 'cafe' }, git });
  assert.ok(calls.some((args) => args.includes('cafe...HEAD')));
});
