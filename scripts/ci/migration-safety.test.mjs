import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkMigrations,
  destructiveOperations,
  prismaEnums,
  prismaTables,
  sqlTokens,
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

const enumSchema = `${schema}
enum ExampleStatus {
  ACTIVE // comment
  ARCHIVED
}

enum MappedState {
  ON
  OFF

  @@map("mapped_state")
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

test('treats table and column renames as contracts that retire the old name', () => {
  const { operations } = destructiveOperations(`
    ALTER TABLE "batches" RENAME TO "turbo_runs";
    ALTER TABLE "posts" RENAME COLUMN "legacyReviewId" TO "currentReviewId";
    ALTER TABLE "posts" RENAME "legacy" TO "current";
    ALTER TABLE "posts" RENAME CONSTRAINT "a" TO "b";
    ALTER INDEX "x" RENAME TO "y";
  `);
  assert.deepEqual(operations, [
    { type: 'rename-table', table: 'batches' },
    { type: 'rename-column', table: 'posts', column: 'legacyReviewId' },
    { type: 'rename-column', table: 'posts', column: 'legacy' },
  ]);
  assert.throws(
    () => validateContract('ALTER TABLE "examples" RENAME COLUMN "a" TO "b";'),
    /requires exactly one/,
  );
  for (const sql of [
    'ALTER TABLE "examples" RENAME TO "renamed";',
    'ALTER TABLE "examples" RENAME COLUMN "oldField" TO "newField";',
  ]) {
    assert.throws(
      () => validateContract(marker + sql, schema),
      /Prisma client is incompatible/,
    );
  }
  assert.equal(
    validateContract(
      marker + 'ALTER TABLE "examples" RENAME COLUMN "retired" TO "x";',
      schema,
    ),
    'v0.2.0',
  );
});

test('treats enum type renames as contracts that retire the old type name', () => {
  const { operations } = destructiveOperations(`
    ALTER TYPE "BatchStatus" RENAME TO "TurboRunStatus";
    ALTER TYPE public.legacy_kind RENAME TO current_kind;
    ALTER TYPE "Status" RENAME VALUE 'OLD' TO 'NEW';
    ALTER TYPE "Status" ADD VALUE IF NOT EXISTS 'EXTRA';
    ALTER TYPE "Composite" RENAME ATTRIBUTE "a" TO "b";
  `);
  assert.deepEqual(operations, [
    { type: 'rename-enum', enumName: 'BatchStatus' },
    { type: 'rename-enum', enumName: 'legacy_kind' },
  ]);
});

test('an unmarked enum type rename is rejected and a marked one passes', () => {
  const sql = 'ALTER TYPE "ExampleStatus" RENAME TO "ExampleState";';
  assert.throws(() => validateContract(sql), /requires exactly one/);
  assert.throws(
    () => validateContract(sql, enumSchema),
    /requires exactly one/,
  );
  assert.equal(validateContract(marker + sql), 'v0.2.0');
});

test('a marker cannot excuse an enum type still used by the prior generated client', () => {
  for (const name of ['ExampleStatus', 'mapped_state']) {
    assert.throws(
      () =>
        validateContract(
          `${marker}ALTER TYPE "${name}" RENAME TO "renamed";`,
          enumSchema,
        ),
      /Prisma client is incompatible with rename-enum/,
    );
  }
  assert.equal(
    validateContract(
      `${marker}ALTER TYPE "RetiredStatus" RENAME TO "renamed";`,
      enumSchema,
    ),
    'v0.2.0',
  );
  assert.deepEqual([...prismaEnums(enumSchema)].sort(), [
    'ExampleStatus',
    'mapped_state',
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

test('fails closed when the prior generated schema cannot be parsed', () => {
  assert.throws(
    () =>
      validateContract(
        `${marker}DROP TABLE "retired";`,
        'generator client { provider = "prisma-client" }',
      ),
    /no parsed Prisma models/,
  );
});

test('allows static CREATE TRIGGER ... EXECUTE FUNCTION and EXECUTE PROCEDURE', () => {
  for (const sql of [
    'CREATE TRIGGER "t" BEFORE INSERT ON "ingredients" FOR EACH ROW EXECUTE FUNCTION "f"();',
    'CREATE TRIGGER "t" BEFORE UPDATE ON "ingredients" FOR EACH ROW WHEN (OLD."origin" = \'UNKNOWN\') EXECUTE PROCEDURE "f"();',
  ]) {
    assert.deepEqual(destructiveOperations(sql).operations, []);
  }
});

test('rejects dynamic SQL, unknown schemas, and malformed SQL rather than skipping them', () => {
  for (const sql of [
    'DO $$ BEGIN EXECUTE \'DROP TABLE "examples"\'; END $$;',
    "DO $$ BEGIN EXECUTE format('DROP TABLE %I', 'examples'); END $$;",
    'PREPARE drop_examples AS DROP TABLE "examples"; EXECUTE drop_examples;',
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

test('sqlTokens tokenizes a large synthetic migration in linear time', () => {
  const statement =
    `-- note\nALTER TABLE "examples" ADD COLUMN "c" text DEFAULT 'it''s'; /* c */\n` +
    `DO $fn$ BEGIN DROP TABLE x; END $fn$;\n`;
  const small = sqlTokens(statement.repeat(100));
  const start = performance.now();
  const large = sqlTokens(statement.repeat(20000));
  const elapsed = performance.now() - start;
  assert.equal(large.tokens.length, (small.tokens.length / 100) * 20000);
  assert.equal(large.comments.length, 20000);
  assert.ok(elapsed < 3000, `tokenizer took ${Math.round(elapsed)}ms`);
});

test('sqlTokens output is stable for mixed token kinds', () => {
  assert.deepEqual(
    sqlTokens(`SELECT "Id", 'a''b', $$x y$$; -- c\n/* z */ ;`).tokens,
    [
      { value: 'SELECT', kind: 'word' },
      { value: 'Id', kind: 'identifier' },
      { value: ',', kind: 'symbol' },
      { value: "a'b", kind: 'literal' },
      { value: ',', kind: 'symbol' },
      { value: 'x', kind: 'word' },
      { value: 'y', kind: 'word' },
      { value: ';', kind: 'symbol' },
      { value: ';', kind: 'symbol' },
    ],
  );
});
