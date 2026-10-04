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

test('falls back to the head commit when no base resolves', () => {
  const calls = [];
  const git = (args) => {
    calls.push(args);
    if (args[0] === 'rev-parse') throw new Error('no base');
    return '';
  };
  assert.deepEqual(
    changedMigrationFiles({ base: undefined, env: {}, git }),
    [],
  );
  const diff = calls.find((args) => args[0] === 'diff');
  assert.ok(diff.includes('HEAD^'));
});
