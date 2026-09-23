import { readFileSync } from 'node:fs';
import { Pool, type PoolClient } from 'pg';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL(
    './migrations/20260924090000_retain_tenant_scoped_agent_audits/migration.sql',
    import.meta.url,
  ),
  'utf8',
);
const publishCreation = readFileSync(
  new URL(
    './migrations/20260827120000_scheduler_loop_remaining/migration.sql',
    import.meta.url,
  ),
  'utf8',
);
const executionLink = readFileSync(
  new URL(
    './migrations/20260829120000_drop_agent_runs_link_workflow_executions/migration.sql',
    import.meta.url,
  ),
  'utf8',
);
const untrustedCreation = readFileSync(
  new URL(
    './migrations/20260921090000_agent_untrusted_content_audits/migration.sql',
    import.meta.url,
  ),
  'utf8',
);

function requiredStatement(source: string, pattern: RegExp): string {
  const statement = source.match(pattern)?.[0];
  if (!statement)
    throw new Error('Historical audit migration statement is missing');
  return statement;
}

// Both names designate disposable test databases; never inherit DATABASE_URL.
const databaseUrl =
  process.env.AUDIT_TENANCY_TEST_DATABASE_URL ??
  process.env.KNOWLEDGE_TEST_DATABASE_URL;
const auditTables = [
  'agent_publish_audits',
  'agent_untrusted_content_audits',
] as const;
const references = [
  ['brandId', 'brands'],
  ['workflowExecutionId', 'workflow_executions'],
  ['postGroupId', 'post_groups'],
] as const;

async function fixture(
  run: (client: PoolClient) => Promise<void>,
  migrate = true,
) {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  const client = await pool.connect();
  const schema = `audit_tenancy_${process.pid}_${Date.now()}`;
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    await client.query(`
      CREATE TABLE organizations (id text PRIMARY KEY, "isDeleted" boolean DEFAULT false);
      CREATE TABLE users (id text PRIMARY KEY, "isDeleted" boolean DEFAULT false);
      INSERT INTO organizations (id) VALUES ('org-a'), ('org-b');
      INSERT INTO users (id) VALUES ('user-a');
    `);
    for (const [, table] of references) {
      await client.query(`CREATE TABLE "${table}" (id text PRIMARY KEY, "organizationId" text NOT NULL, "isDeleted" boolean DEFAULT false ${table === 'brands' ? ', UNIQUE (id, "organizationId")' : ''});
        INSERT INTO "${table}" (id, "organizationId") VALUES ('a', 'org-a'), ('b', 'org-b');`);
    }
    // Execute original audit DDL and ownership-link migration statements, not replicas.
    await client.query(
      requiredStatement(
        publishCreation,
        /CREATE TYPE "agent_publish_decision"[^;]+;/,
      ),
    );
    await client.query(
      requiredStatement(
        publishCreation,
        /CREATE TABLE "agent_publish_audits"[\s\S]*?\n\);/,
      ),
    );
    for (const statement of executionLink.matchAll(
      /ALTER TABLE "agent_publish_audits"[\s\S]*?;/g,
    )) {
      await client.query(statement[0]);
    }
    await client.query(untrustedCreation);
    // Fixture-only defaults keep inserts focused on the reference under test.
    await client.query(`
      ALTER TABLE agent_publish_audits ALTER COLUMN "autonomyMode" SET DEFAULT 'assisted', ALTER COLUMN "policyName" SET DEFAULT 'fixture', ALTER COLUMN decision SET DEFAULT 'DENIED', ALTER COLUMN reason SET DEFAULT 'fixture';
      ALTER TABLE agent_untrusted_content_audits ALTER COLUMN "toolName" SET DEFAULT 'search_knowledge', ALTER COLUMN source SET DEFAULT 'web_fetch', ALTER COLUMN outcome SET DEFAULT 'shadow_flagged', ALTER COLUMN confidence SET DEFAULT 0.99, ALTER COLUMN "minConfidence" SET DEFAULT 0.95, ALTER COLUMN mode SET DEFAULT 'shadow', ALTER COLUMN "contentLength" SET DEFAULT 1, ALTER COLUMN "updatedAt" SET DEFAULT now();
    `);
    if (migrate) await client.query(migration);
    await run(client);
  } finally {
    await client.query('ROLLBACK');
    await client.query('RESET search_path');
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    client.release();
    await pool.end();
  }
}

describe.skipIf(!databaseUrl)(
  'retained tenant-scoped security audits on PostgreSQL',
  () => {
    for (const table of auditTables) {
      const supported = references.filter(
        ([column]) =>
          column !== 'postGroupId' || table === 'agent_publish_audits',
      );
      for (const [column, parent] of supported) {
        it(`${table}.${column} rejects cross-tenant inserts and updates and accepts null`, async () =>
          fixture(async (client) => {
            const insert = `INSERT INTO "${table}" (id, "organizationId", "userId", "${column}") VALUES ($1, 'org-a', 'user-a', $2)`;
            await expect(
              client.query(insert, ['bad', 'b']),
            ).rejects.toMatchObject({ code: '23503' });
            await client.query(insert, ['valid', 'a']);
            await client.query(insert, ['nullable', null]);
            await expect(
              client.query(
                `UPDATE "${table}" SET "${column}" = 'b' WHERE id = 'valid'`,
              ),
            ).rejects.toMatchObject({ code: '23503' });
            await expect(
              client.query(
                `UPDATE "${table}" SET "organizationId" = 'org-b' WHERE id = 'valid'`,
              ),
            ).rejects.toMatchObject({ code: '23503' });
          }));

        it.each([false, true])(
          `${table}.${column} retains parent and ownership with deleted audit=%s`,
          async (deleted) =>
            fixture(async (client) => {
              await client.query(
                `INSERT INTO "${table}" (id, "organizationId", "userId", "${column}", "isDeleted") VALUES ('audit', 'org-a', 'user-a', 'a', $1)`,
                [deleted],
              );
              await expect(
                client.query(`DELETE FROM "${parent}" WHERE id = 'a'`),
              ).rejects.toMatchObject({ code: '23503' });
              await expect(
                client.query(
                  `UPDATE "${parent}" SET "organizationId" = 'org-b' WHERE id = 'a'`,
                ),
              ).rejects.toMatchObject({ code: '23503' });
              await expect(
                client.query(
                  `UPDATE "${parent}" SET id = 'renamed' WHERE id = 'a'`,
                ),
              ).rejects.toMatchObject({ code: '23503' });
              await client.query(
                `UPDATE "${parent}" SET "isDeleted" = true WHERE id = 'a'`,
              );
              expect(
                (
                  await client.query(
                    `SELECT "${column}", "organizationId", "isDeleted" FROM "${table}" WHERE id = 'audit'`,
                  )
                ).rows,
              ).toEqual([
                { [column]: 'a', organizationId: 'org-a', isDeleted: deleted },
              ]);
            }),
        );

        it(`${table}.${column} dirty history rolls back all migration DDL without repair`, async () =>
          fixture(async (client) => {
            await client.query(
              `INSERT INTO "${table}" (id, "organizationId", "userId", "${column}", "isDeleted") VALUES ('dirty', 'org-a', 'user-a', 'b', true)`,
            );
            await expect(client.query(migration)).rejects.toMatchObject({
              code: '23503',
            });
            await client.query('ROLLBACK');
            expect(
              (
                await client.query(
                  `SELECT "${column}", "organizationId", "isDeleted" FROM "${table}"`,
                )
              ).rows,
            ).toEqual([
              { [column]: 'b', organizationId: 'org-a', isDeleted: true },
            ]);
            expect(
              (
                await client.query(
                  `SELECT indexname FROM pg_indexes WHERE schemaname = current_schema() AND indexname IN ('post_groups_id_organizationId_key', 'workflow_executions_id_organizationId_key')`,
                )
              ).rows,
            ).toEqual([]);
            // Original single-column FK and update policy survived the rollback too.
            const original = await client.query(
              `SELECT confupdtype, array_length(conkey, 1) AS columns FROM pg_constraint WHERE conrelid = $1::regclass AND conname = $2`,
              [table, `${table}_${column}_fkey`],
            );
            expect(original.rows).toEqual([{ confupdtype: 'c', columns: 1 }]);
          }, false));
      }

      it.each([
        ['userId', 'users', 'user-a'],
        ['organizationId', 'organizations', 'org-a'],
      ] as const)(
        `${table} retains %s attribution`,
        async (_column, parent, id) =>
          fixture(async (client) => {
            await client.query(
              `INSERT INTO "${table}" (id, "organizationId", "userId", "isDeleted") VALUES ('audit', 'org-a', 'user-a', true)`,
            );
            await expect(
              client.query(`DELETE FROM "${parent}" WHERE id = $1`, [id]),
            ).rejects.toMatchObject({ code: '23503' });
            await expect(
              client.query(
                `UPDATE "${parent}" SET id = 'renamed' WHERE id = $1`,
                [id],
              ),
            ).rejects.toMatchObject({ code: '23503' });
            await client.query(
              `UPDATE "${parent}" SET "isDeleted" = true WHERE id = $1`,
              [id],
            );
            expect(
              (
                await client.query(
                  `SELECT "userId", "organizationId" FROM "${table}"`,
                )
              ).rows,
            ).toEqual([{ userId: 'user-a', organizationId: 'org-a' }]);
          }),
      );
    }
  },
);
