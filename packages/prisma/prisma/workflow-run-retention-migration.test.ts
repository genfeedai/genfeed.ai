import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Pool, type PoolClient } from 'pg';
import { describe, expect, it } from 'vitest';

// A disposable database; each test builds its own schema, never DATABASE_URL.
const connectionString = process.env.KNOWLEDGE_TEST_DATABASE_URL;

function migration(name: string): string {
  return readFileSync(
    new URL(`./migrations/${name}/migration.sql`, import.meta.url),
    'utf8',
  );
}

const orphanCleanup = migration(
  '20261116100100_delete_orphan_workflow_node_claims',
);
const claimsForeignKey = migration(
  '20261116100200_workflow_node_claims_execution_fk',
);
const claimsValidation = migration(
  '20261116100300_validate_workflow_node_claims_execution_fk',
);
const purgeAtBackfill = migration(
  '20261116100500_backfill_workflow_execution_purge_at',
);

async function inSchema(run: (client: PoolClient) => Promise<void>) {
  const pool = new Pool({ connectionString, max: 1 });
  const client = await pool.connect();
  const schema = `wf_retention_${randomUUID().replaceAll('-', '')}`;
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query(`SET search_path TO "${schema}"`);
    await client.query(`
      CREATE TABLE "data_backfills" (
        "id" text PRIMARY KEY,
        "report" jsonb NOT NULL,
        "completedAt" timestamp NOT NULL DEFAULT now()
      );
    `);
    await run(client);
  } finally {
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    client.release();
    await pool.end();
  }
}

describe.skipIf(!connectionString)(
  'workflow node claims foreign key migrations on PostgreSQL (#10383)',
  () => {
    async function claimsFixture(client: PoolClient) {
      await client.query(`
        CREATE TABLE "workflow_executions" ("id" text PRIMARY KEY);
        CREATE TABLE "workflow_node_claims" (
          "id" text PRIMARY KEY,
          "organizationId" text NOT NULL,
          "executionId" text NOT NULL,
          "nodeId" text NOT NULL,
          "status" text NOT NULL
        );
        INSERT INTO "workflow_executions" ("id") VALUES ('run-live'), ('run-running');
        INSERT INTO "workflow_node_claims" ("id", "organizationId", "executionId", "nodeId", "status") VALUES
          ('claim-live', 'org', 'run-live', 'node', 'completed'),
          ('claim-running', 'org', 'run-running', 'node', 'running'),
          ('claim-orphan-1', 'org', 'run-gone', 'node', 'completed'),
          ('claim-orphan-2', 'org', 'run-gone', 'other', 'failed');
      `);
    }

    async function claimIds(client: PoolClient): Promise<string[]> {
      const { rows } = await client.query<{ id: string }>(
        `SELECT "id" FROM "workflow_node_claims" ORDER BY "id"`,
      );
      return rows.map((row) => row.id);
    }

    it('deletes only the claims whose run no longer exists and reports the count', async () => {
      await inSchema(async (client) => {
        await claimsFixture(client);

        await client.query(orphanCleanup);

        expect(await claimIds(client)).toEqual(['claim-live', 'claim-running']);
        const { rows } = await client.query(
          `SELECT "report" FROM "data_backfills" WHERE "id" = 'workflow_node_claims_orphan_cleanup_20261116'`,
        );
        expect(rows).toEqual([{ report: { claimsDeleted: 2 } }]);
      });
    });

    it('deletes the claims of a deleted run and leaves a running run untouched', async () => {
      await inSchema(async (client) => {
        await claimsFixture(client);
        await client.query(orphanCleanup);
        await client.query(claimsForeignKey);
        await client.query(claimsValidation);

        await client.query(
          `DELETE FROM "workflow_executions" WHERE "id" = 'run-live'`,
        );

        expect(await claimIds(client)).toEqual(['claim-running']);
      });
    });

    it('rejects a claim for a run that does not exist once the key is in place', async () => {
      await inSchema(async (client) => {
        await claimsFixture(client);
        await client.query(orphanCleanup);
        await client.query(claimsForeignKey);

        await expect(
          client.query(
            `INSERT INTO "workflow_node_claims" ("id", "organizationId", "executionId", "nodeId", "status") VALUES ('claim-new', 'org', 'run-gone', 'node', 'running')`,
          ),
        ).rejects.toThrow(/workflow_node_claims_executionId_fkey/);
      });
    });

    it('removes claims orphaned while the key was NOT VALID before it validates', async () => {
      await inSchema(async (client) => {
        await claimsFixture(client);
        await client.query(claimsForeignKey);

        await client.query(claimsValidation);

        expect(await claimIds(client)).toEqual(['claim-live', 'claim-running']);
        const { rows } = await client.query<{ convalidated: boolean }>(
          `SELECT "convalidated" FROM pg_constraint WHERE "conname" = 'workflow_node_claims_executionId_fkey' AND "connamespace" = current_schema()::regnamespace`,
        );
        expect(rows).toEqual([{ convalidated: true }]);
      });
    });
  },
);

describe.skipIf(!connectionString)(
  'workflow execution purgeAt backfill on PostgreSQL (#10382)',
  () => {
    const systemPrincipal = 'genfeed-public-tools';

    async function runsFixture(client: PoolClient) {
      await client.query(`
        CREATE TABLE "workflows" ("id" text PRIMARY KEY, "organizationId" text NOT NULL);
        CREATE TABLE "workflow_executions" (
          "id" text PRIMARY KEY,
          "workflowId" text NOT NULL,
          "status" text NOT NULL,
          "canonicalId" text,
          "dispatchClass" text,
          "isDeleted" boolean NOT NULL DEFAULT false,
          "completedAt" timestamp,
          "updatedAt" timestamp NOT NULL DEFAULT now(),
          "purgeAfterHours" integer,
          "purgeAt" timestamp,
          "payloadScrubbedAt" timestamp,
          "scrubAllNodePayloads" boolean NOT NULL DEFAULT false,
          "scrubNodeIds" text[] NOT NULL DEFAULT '{}',
          "retentionPolicy" text
        );
        INSERT INTO "workflows" ("id", "organizationId") VALUES
          ('system-workflow', '${systemPrincipal}'),
          ('tenant-workflow', 'org-customer');
      `);
    }

    async function insertRun(
      client: PoolClient,
      id: string,
      run: {
        canonicalId?: string | null;
        completedAt?: string;
        dispatchClass?: string | null;
        status?: string;
        workflowId?: string;
        scrubAll?: boolean;
      } = {},
    ) {
      await client.query(
        `INSERT INTO "workflow_executions"
           ("id", "workflowId", "status", "canonicalId", "dispatchClass", "completedAt", "scrubAllNodePayloads")
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          id,
          run.workflowId ?? 'system-workflow',
          run.status ?? 'COMPLETED',
          run.canonicalId === undefined
            ? 'lifecycle-email.sweep'
            : run.canonicalId,
          run.dispatchClass === undefined ? 'background' : run.dispatchClass,
          run.completedAt ?? '2026-11-10T10:00:00Z',
          run.scrubAll ?? false,
        ],
      );
    }

    async function policies(client: PoolClient) {
      const { rows } = await client.query<{
        id: string;
        purgeAt: string | null;
        retentionPolicy: string | null;
      }>(
        `SELECT "id", "retentionPolicy", to_char("purgeAt", 'YYYY-MM-DD"T"HH24:MI') AS "purgeAt"
         FROM "workflow_executions" ORDER BY "id"`,
      );
      return Object.fromEntries(
        rows.map((row) => [row.id, [row.retentionPolicy, row.purgeAt]]),
      );
    }

    it('purges 24 hours after success and 14 days after failure for background system runs', async () => {
      await inSchema(async (client) => {
        await runsFixture(client);
        await insertRun(client, 'ok');
        await insertRun(client, 'failed', { status: 'FAILED' });
        await insertRun(client, 'cancelled', { status: 'CANCELLED' });
        await insertRun(client, 'no-canonical', { canonicalId: null });

        await client.query(purgeAtBackfill);

        expect(await policies(client)).toEqual({
          cancelled: ['background', '2026-11-24T10:00'],
          failed: ['background', '2026-11-24T10:00'],
          'no-canonical': ['background', '2026-11-11T10:00'],
          ok: ['background', '2026-11-11T10:00'],
        });
      });
    });

    it('keeps runs a person or an agent started, tenant workflows, scrub contracts and unfinished runs', async () => {
      await inSchema(async (client) => {
        await runsFixture(client);
        await insertRun(client, 'agent-turn', {
          canonicalId: 'agent.turn.execute',
        });
        await insertRun(client, 'agent-tool', {
          canonicalId: 'agent.tool.get_posts',
        });
        await insertRun(client, 'clipper', {
          canonicalId: 'clipper.generation.one',
        });
        await insertRun(client, 'publish-now', {
          canonicalId: 'scheduled-post.publish',
          dispatchClass: 'interactive',
        });
        await insertRun(client, 'tenant-run', {
          workflowId: 'tenant-workflow',
        });
        await insertRun(client, 'scrub-contract', { scrubAll: true });
        await insertRun(client, 'running', { status: 'RUNNING' });

        await client.query(purgeAtBackfill);

        expect(await policies(client)).toEqual({
          'agent-tool': [null, null],
          'agent-turn': [null, null],
          clipper: [null, null],
          'publish-now': [null, null],
          running: [null, null],
          'scrub-contract': [null, null],
          'tenant-run': [null, null],
        });
      });
    });

    it('is safe to apply again and does not move a purge time it already set', async () => {
      await inSchema(async (client) => {
        await runsFixture(client);
        await insertRun(client, 'ok');

        await client.query(purgeAtBackfill);
        await client.query(
          `UPDATE "workflow_executions" SET "purgeAt" = '2030-01-01T00:00:00Z' WHERE "id" = 'ok'`,
        );
        await client.query(purgeAtBackfill);

        expect(await policies(client)).toEqual({
          ok: ['background', '2030-01-01T00:00'],
        });
      });
    });

    it('covers more than one batch of runs', async () => {
      await inSchema(async (client) => {
        await runsFixture(client);
        await client.query(`
          INSERT INTO "workflow_executions" ("id", "workflowId", "status", "canonicalId", "completedAt")
          SELECT 'bulk-' || n, 'system-workflow', 'COMPLETED', 'lifecycle-email.sweep', '2026-11-10T10:00:00Z'
          FROM generate_series(1, 4500) AS n`);

        await client.query(purgeAtBackfill);

        const { rows } = await client.query<{ n: string }>(
          `SELECT count(*) AS n FROM "workflow_executions" WHERE "retentionPolicy" = 'background'`,
        );
        expect(Number(rows[0]?.n)).toBe(4500);
      });
    });
  },
);
