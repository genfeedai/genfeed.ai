import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkMigrations,
  destructiveOperations,
  prismaTables,
  validateContract,
} from './migration-safety.mjs';

const marker = '-- genfeed-contract-after: v0.2.0\n';
const schema = `model Example {
  id String @id
  required String
  optional String?
  payload Json @default("{}")
  mapped String @map("oldField")
  @@map("examples")
}
`;

test('recognizes PostgreSQL contract syntax, qualified names, multiple actions, and CASCADE', () => {
  const { operations } = destructiveOperations(`
    ALTER TABLE IF EXISTS ONLY public."examples" *
      DROP /* nested /* safe */ comment */ COLUMN IF EXISTS "oldField",
      DROP "other", ALTER COLUMN "required" SET NOT NULL;
    DROP TABLE IF EXISTS "retired", public.other CASCADE;
    DO $$ BEGIN ALTER TABLE "examples" ALTER "optional" SET NOT NULL; END $$;
  `);
  assert.deepEqual(operations, [
    { type: 'drop-column', table: 'examples', column: 'oldField' },
    { type: 'drop-column', table: 'examples', column: 'other' },
    { type: 'not-null', table: 'examples', column: 'required' },
    { type: 'drop-table', table: 'retired' },
    { type: 'drop-table', table: 'other' },
    { type: 'not-null', table: 'examples', column: 'optional' },
  ]);
});

test('comments, string literals, defaults, and constraints do not invent contracts or markers', () => {
  assert.equal(
    validateContract(`-- DROP TABLE "x";
    /* ALTER TABLE "x" DROP COLUMN "y"; */
    SELECT 'DROP TABLE "x";';
    ALTER TABLE "examples" ALTER COLUMN "required" SET DEFAULT 'DROP COLUMN';
    ALTER TABLE "examples" DROP CONSTRAINT "old_fk";
    ALTER TABLE "examples" ALTER COLUMN "required" DROP DEFAULT;
    ALTER TABLE "examples" ALTER COLUMN "required" DROP NOT NULL;
  `),
    null,
  );
  assert.throws(
    () =>
      validateContract(
        `SELECT '-- genfeed-contract-after: v0.2.0'; DROP TABLE "x";`,
      ),
    /requires exactly one/,
  );
});

test('rejects absent, duplicate, malformed, and prerelease markers', () => {
  for (const prefix of [
    '',
    marker + marker,
    '-- genfeed-contract-after: latest\n',
    '-- genfeed-contract-after: v0.2.0-rc.1\n',
  ]) {
    assert.throws(
      () => validateContract(`${prefix}DROP TABLE "retired";`),
      /requires exactly one/,
    );
  }
});

test('a marker cannot excuse any column still selected by the prior generated client', () => {
  for (const sql of [
    'DROP TABLE "examples" CASCADE;',
    'ALTER TABLE "examples" DROP COLUMN "oldField";',
    'ALTER TABLE "examples" ALTER COLUMN "optional" SET NOT NULL;',
    'ALTER TABLE "examples" ALTER COLUMN "newField" SET NOT NULL;',
  ]) {
    assert.throws(
      () => validateContract(marker + sql, schema),
      /Prisma client is incompatible/,
    );
  }
  assert.throws(
    () =>
      validateContract(
        marker +
          'ALTER TABLE "examples" DROP COLUMN "retired", DROP COLUMN "oldField";',
        schema,
      ),
    /oldField/,
  );
  for (const sql of [
    'DROP TABLE "retired";',
    'ALTER TABLE "examples" DROP COLUMN "retired";',
    'ALTER TABLE "examples" ALTER COLUMN "required" SET NOT NULL;',
  ]) {
    assert.equal(validateContract(marker + sql, schema), 'v0.2.0');
  }
  assert.ok(prismaTables(schema).get('examples').has('oldField'));
});

test('rejects dynamic SQL, unknown schemas, and malformed SQL rather than skipping them', () => {
  for (const sql of [
    'DO $$ BEGIN EXECUTE \'DROP TABLE "examples"\'; END $$;',
    'ALTER TABLE tenant."examples" DROP COLUMN "oldField";',
    'DROP TABLE "unterminated',
    '/* unterminated',
  ]) {
    assert.throws(() => validateContract(marker + sql));
  }
});

function fixture({
  status = 'A',
  sql = `${marker}DROP TABLE "retired";`,
  published = {},
  isAncestor = true,
} = {}) {
  const calls = [];
  const file =
    'packages/prisma/prisma/migrations/20261004000000_contract/migration.sql';
  const git = (_, args) => {
    calls.push(args);
    if (args[0] === 'rev-parse') return 'a'.repeat(40);
    if (args[0] === 'diff') return `${status}\t${file}\n`;
    if (args[0] === 'merge-base') {
      if (!isAncestor) throw new Error('not an ancestor');
      return '';
    }
    if (args[0] === 'show') return schema;
    throw new Error(`unexpected git ${args}`);
  };
  return {
    calls,
    run: () =>
      checkMigrations({
        base: 'HEAD^1',
        cwd: '/fixture',
        git,
        read: () => sql,
        release: () =>
          JSON.stringify({
            tag_name: 'v0.2.0',
            published_at: '2026-10-01',
            draft: false,
            prerelease: false,
            ...published,
          }),
      }),
  };
}

test('requires published stable ancestor release evidence, preserving applied SQL checksums', () => {
  assert.equal(fixture().run(), 1);
  for (const published of [
    { draft: true },
    { prerelease: true },
    { published_at: null },
    { tag_name: 'v0.1.77' },
  ]) {
    assert.throws(fixture({ published }).run, /published stable release/);
  }
  assert.throws(fixture({ isAncestor: false }).run, /not an ancestor/);
  for (const status of ['M', 'D'])
    assert.throws(fixture({ status }).run, /immutable/);
  assert.throws(
    fixture({ sql: `${marker}DROP TABLE "examples";` }).run,
    /incompatible/,
  );
  const expand = fixture({
    sql: 'ALTER TABLE "examples" ADD COLUMN "newField" TEXT;',
  });
  assert.equal(expand.run(), 1);
  assert.ok(!expand.calls.some((args) => args[0] === 'show'));
});
