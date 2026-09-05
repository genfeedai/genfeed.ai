import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL(
    './migrations/20260905120000_agent_failure_feedback/migration.sql',
    import.meta.url,
  ),
  'utf8',
);
const indexMigration = readFileSync(
  new URL(
    './migrations/20260905120100_agent_failure_feedback_index/migration.sql',
    import.meta.url,
  ),
  'utf8',
);
const databaseUrl = process.env.DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;

describePostgres('agent failure feedback migration', () => {
  it('preserves historical rows, builds the index online, and enforces typed future failures', async () => {
    const pool = new Pool({ connectionString: databaseUrl, max: 1 });
    const client = await pool.connect();
    const schema = `agent_failure_${process.pid}_${Date.now()}`;
    try {
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET search_path TO "${schema}"`);
      await client.query(`
        CREATE TYPE "WorkflowExecutionStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');
        CREATE TABLE "workflow_executions" (
          "id" text PRIMARY KEY, "status" "WorkflowExecutionStatus" NOT NULL,
          "isDeleted" boolean NOT NULL DEFAULT false, "completedAt" timestamp,
          "error" text
        );
        INSERT INTO "workflow_executions" ("id", "status", "error")
        VALUES ('failed', 'FAILED', 'legacy provider error'), ('completed', 'COMPLETED', NULL);
      `);
      await client.query(migration);
      await client.query(indexMigration);
      const rows = await client.query(
        'SELECT "id", "failureReason", "failure", "error" FROM "workflow_executions" ORDER BY "id"',
      );
      expect(rows.rows).toEqual([
        { id: 'completed', failureReason: null, failure: null, error: null },
        {
          id: 'failed',
          failureReason: null,
          failure: null,
          error: 'legacy provider error',
        },
      ]);
      await client.query(
        'UPDATE "workflow_executions" SET "failureReason" = $1, "failure" = $2 WHERE "id" = $3',
        [
          'RATE_LIMITED',
          JSON.stringify({
            reason: 'RATE_LIMITED',
            title: 'Provider rate limited',
          }),
          'failed',
        ],
      );
      const filtered = await client.query(
        'SELECT "id" FROM "workflow_executions" WHERE "failureReason" = $1',
        ['RATE_LIMITED'],
      );
      expect(filtered.rows).toEqual([{ id: 'failed' }]);
      const indexes = await client.query(
        'SELECT indexname FROM pg_indexes WHERE schemaname = $1',
        [schema],
      );
      expect(indexes.rows).toContainEqual({
        indexname: 'workflow_executions_failure_feed_idx',
      });
      await expect(
        client.query('UPDATE "workflow_executions" SET "failureReason" = $1', [
          'invented',
        ]),
      ).rejects.toThrow('invalid input value for enum');
    } finally {
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      client.release();
      await pool.end();
    }
  });
});
