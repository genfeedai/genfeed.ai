import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool, type PoolClient } from 'pg';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const migrationSource = readFileSync(
  join(
    prismaDir,
    'migrations/20260828120000_immutable_workflow_versions/migration.sql',
  ),
  'utf8',
);

async function createLegacyWorkflowSchema(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE "users" ("id" text PRIMARY KEY);
    CREATE TABLE "organizations" ("id" text PRIMARY KEY);
    CREATE TABLE "workflows" (
      "id" text PRIMARY KEY,
      "organizationId" text NOT NULL,
      "userId" text NOT NULL,
      "nodes" jsonb NOT NULL DEFAULT '[]',
      "edges" jsonb NOT NULL DEFAULT '[]',
      "steps" jsonb NOT NULL DEFAULT '[]',
      "inputVariables" jsonb NOT NULL DEFAULT '[]',
      "lockedNodeIds" jsonb NOT NULL DEFAULT '[]',
      "createdAt" timestamp NOT NULL DEFAULT now(),
      "updatedAt" timestamp NOT NULL DEFAULT now()
    );
    CREATE TABLE "workflow_executions" (
      "id" text PRIMARY KEY,
      "workflowId" text NOT NULL,
      "organizationId" text NOT NULL,
      "createdAt" timestamp NOT NULL DEFAULT now()
    );
    INSERT INTO "users" ("id") VALUES ('user_fixture');
    INSERT INTO "organizations" ("id") VALUES ('org_fixture');
  `);
}

describe('immutable workflow version migration', () => {
  it('hard-cuts mutable graph columns and fails closed on unknown actions', () => {
    expect(migrationSource).toContain(
      'CREATE FUNCTION workflow_action_is_supported(action_id TEXT)',
    );
    expect(migrationSource).toContain(
      'IF NOT workflow_action_is_supported(action_id)',
    );
    expect(migrationSource).toContain('references unsupported action');
    expect(migrationSource).toContain('has unconvertible category');
    expect(migrationSource).toContain('DROP COLUMN "steps"');
    expect(migrationSource).toContain('DROP COLUMN "nodes"');
    expect(migrationSource).toContain('DROP COLUMN "edges"');
  });

  it('pins every existing execution to the migrated immutable version', () => {
    expect(migrationSource).toContain(
      'ALTER TABLE "workflow_executions" ADD COLUMN "workflowVersionId" TEXT',
    );
    expect(migrationSource).toContain(
      'ALTER TABLE "workflow_executions" ALTER COLUMN "workflowVersionId" SET NOT NULL',
    );
    expect(migrationSource).toContain(
      'FOREIGN KEY ("workflowVersionId") REFERENCES "workflow_versions"("id")',
    );
  });
});

const databaseUrl = process.env.DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;

describePostgres('immutable workflow version migration on PostgreSQL', () => {
  it('converts graph aliases and every supported legacy step category', async () => {
    const pool = new Pool({ connectionString: databaseUrl, max: 1 });
    const client = await pool.connect();
    const schemaName = `workflow_version_cutover_${process.pid}_${Date.now()}`;

    try {
      await client.query(`CREATE SCHEMA "${schemaName}"`);
      await client.query(`SET search_path TO "${schemaName}", public`);
      await createLegacyWorkflowSchema(client);

      const graphNodes = [
        { id: 'input_node', type: 'workflow-input' },
        {
          data: { config: { prompt: 'fixture prompt' } },
          id: 'video_node',
          type: 'ai-generate-video',
        },
        {
          data: {
            config: {
              actionId: 'create_article',
              parameters: { title: 'Fixture article' },
            },
          },
          id: 'article_node',
          type: 'genfeedAction',
        },
        { id: 'condition_node', type: 'condition' },
      ];
      const stepCategories = [
        'transform',
        'upscale',
        'resize',
        'caption',
        'clip',
        'publish',
        'webhook',
        'generate-image',
        'generate-video',
        'generate-article',
        'color-grade',
        'generate-hook',
        'text-overlay',
        'image-batch',
        'performance-track',
        'delay',
      ];
      const steps = stepCategories.map((category, index) => ({
        category,
        dependsOn: index === 0 ? [] : [`step_${index - 1}`],
        id: `step_${index}`,
      }));

      await client.query(
        `
          INSERT INTO "workflows"
            ("id", "organizationId", "userId", "nodes", "edges", "steps")
          VALUES
            ('workflow_graph', 'org_fixture', 'user_fixture', $1::jsonb, $2::jsonb, '[]'::jsonb),
            ('workflow_steps', 'org_fixture', 'user_fixture', '[]'::jsonb, '[]'::jsonb, $3::jsonb);
          INSERT INTO "workflow_executions"
            ("id", "workflowId", "organizationId")
          VALUES ('execution_fixture', 'workflow_graph', 'org_fixture');
        `,
        [
          JSON.stringify(graphNodes),
          JSON.stringify([
            {
              id: 'input_to_video',
              source: 'input_node',
              target: 'video_node',
            },
          ]),
          JSON.stringify(steps),
        ],
      );

      await client.query('BEGIN');
      await client.query(migrationSource);

      const versions = await client.query<{
        graph: {
          edges: Array<{ source: string; target: string }>;
          nodes: Array<{
            data?: { config?: { actionId?: string } };
            id: string;
            type: string;
          }>;
        };
        workflowId: string;
      }>(`
        SELECT "workflowId", "graph"
        FROM "workflow_versions"
        ORDER BY "workflowId"
      `);
      const graphVersion = versions.rows.find(
        (version) => version.workflowId === 'workflow_graph',
      );
      const stepVersion = versions.rows.find(
        (version) => version.workflowId === 'workflow_steps',
      );

      expect(graphVersion?.graph.nodes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'input_node', type: 'workflowInput' }),
          expect.objectContaining({
            data: expect.objectContaining({
              config: expect.objectContaining({ actionId: 'videoGen' }),
            }),
            id: 'video_node',
            type: 'genfeedAction',
          }),
          expect.objectContaining({
            data: expect.objectContaining({
              config: expect.objectContaining({ actionId: 'create_article' }),
            }),
            id: 'article_node',
            type: 'genfeedAction',
          }),
          expect.objectContaining({ id: 'condition_node', type: 'condition' }),
        ]),
      );
      expect(
        stepVersion?.graph.nodes.filter(
          (node) => node.type === 'genfeedAction',
        ),
      ).toHaveLength(stepCategories.length - 1);
      expect(stepVersion?.graph.edges).toHaveLength(stepCategories.length - 1);

      const execution = await client.query<{ workflowVersionId: string }>(`
        SELECT "workflowVersionId"
        FROM "workflow_executions"
        WHERE "id" = 'execution_fixture'
      `);
      expect(execution.rows[0]?.workflowVersionId).toBe(
        'wv_legacy_workflow_graph',
      );

      const legacyColumns = await client.query<{ column_name: string }>(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = '${schemaName}'
          AND table_name = 'workflows'
          AND column_name IN ('steps', 'nodes', 'edges', 'inputVariables', 'lockedNodeIds')
      `);
      expect(legacyColumns.rows).toEqual([]);
      await client.query('ROLLBACK');
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      client.release();
      await pool.end();
    }
  });

  it('aborts instead of persisting an unknown graph action', async () => {
    const pool = new Pool({ connectionString: databaseUrl, max: 1 });
    const client = await pool.connect();
    const schemaName = `workflow_version_reject_${process.pid}_${Date.now()}`;

    try {
      await client.query(`CREATE SCHEMA "${schemaName}"`);
      await client.query(`SET search_path TO "${schemaName}", public`);
      await createLegacyWorkflowSchema(client);
      await client.query(
        `
          INSERT INTO "workflows"
            ("id", "organizationId", "userId", "nodes")
          VALUES ('workflow_unknown', 'org_fixture', 'user_fixture', $1::jsonb)
        `,
        [JSON.stringify([{ id: 'unknown_node', type: 'removedLegacyNode' }])],
      );

      await client.query('BEGIN');
      await expect(client.query(migrationSource)).rejects.toThrow(
        /references unsupported action/,
      );
      await client.query('ROLLBACK');
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      client.release();
      await pool.end();
    }
  });
});
