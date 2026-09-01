import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool, type PoolClient } from 'pg';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const seededSystemCleanupMigrationSource = readFileSync(
  join(
    prismaDir,
    'migrations/20260828115959_retire_seeded_system_workflow_mirrors/migration.sql',
  ),
  'utf8',
);
const migrationSource = readFileSync(
  join(
    prismaDir,
    'migrations/20260828120000_immutable_workflow_versions/migration.sql',
  ),
  'utf8',
);
const atomicExecutorSnapshot =
  migrationSource.match(
    /CREATE FUNCTION workflow_action_has_atomic_executor\(action_id TEXT\)[\s\S]*?AS \$\$([\s\S]*?)\$\$;/,
  )?.[1] ?? '';
const supportedActionSnapshot =
  migrationSource.match(
    /CREATE FUNCTION workflow_action_is_supported\(action_id TEXT\)[\s\S]*?AS \$\$([\s\S]*?)\$\$;/,
  )?.[1] ?? '';
const workflowExecutorDirectory = join(
  prismaDir,
  '../../workflows/src/engine/executors',
);
const workflowRegistrarDirectory = join(
  prismaDir,
  '../../apps/server/server/src/collections/workflows/services',
);
const actionNodeSource = readFileSync(
  join(prismaDir, '../../workflows/src/engine/utils/action-node.ts'),
  'utf8',
);

const nonActionSentinels = [
  'immediate', // Publish scheduling mode, not an executable action id.
  'unknown', // Runtime diagnostic fallback, not an executable action id.
  'video', // Media port/value type, not an executable action id.
] as const;

const workflowControlActionIds = [
  'workflow.for-each',
  'workflow.for-each-tenant',
  'workflow.run-child',
] as const;

const rejectedLegacyStepCategories = [
  'transform',
  'upscale',
  'resize',
  'caption',
  'clip',
  'publish',
  'webhook',
  'generate-image',
  'generate-video',
  'generate-music',
  'generate-article',
  'color-grade',
  'generate-hook',
  'text-overlay',
  'image-batch',
  'performance-track',
] as const;

const legacyStepCategories = [
  ...rejectedLegacyStepCategories,
  'delay',
] as const;

type JsonRecord = Record<string, unknown>;

interface MigrationFixture {
  client: PoolClient;
  pool: Pool;
  schemaName: string;
}

let fixtureSequence = 0;

function findFilesRecursively(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name);
    return entry.isDirectory() ? findFilesRecursively(entryPath) : [entryPath];
  });
}

function registeredExecutorNodeTypes(): string[] {
  const registrarSource = readdirSync(workflowRegistrarDirectory, {
    withFileTypes: true,
  })
    .filter(
      (entry) =>
        entry.isFile() && entry.name.endsWith('-executor-registrar.service.ts'),
    )
    .map((entry) =>
      readFileSync(join(workflowRegistrarDirectory, entry.name), 'utf8'),
    )
    .join('\n');

  const executorNodeTypes = findFilesRecursively(workflowExecutorDirectory)
    .filter((path) => path.endsWith('-executor.ts'))
    .flatMap((path) => {
      const source = readFileSync(path, 'utf8');
      const registrationSymbols = [
        ...source.matchAll(/export (?:class|function) (\w+)/g),
      ].flatMap((match) => (match[1] ? [match[1]] : []));
      const isRegistered = registrationSymbols.some((symbol) => {
        const occurrences = registrarSource.match(
          new RegExp(`\\b${symbol}\\b`, 'g'),
        );
        return (occurrences?.length ?? 0) >= 2;
      });
      if (!isRegistered) {
        return [];
      }

      return [...source.matchAll(/readonly nodeType = '([^']+)'/g)].flatMap(
        (match) => (match[1] ? [match[1]] : []),
      );
    });
  const directlyRegisteredNodeTypes = [
    ...registrarSource.matchAll(/registerExecutor\(\s*'([^']+)'/g),
  ].flatMap((match) => (match[1] ? [match[1]] : []));

  return [
    ...new Set([...executorNodeTypes, ...directlyRegisteredNodeTypes]),
  ].sort();
}

function sqlStringLiterals(source: string): string[] {
  return [...source.matchAll(/'([^']+)'/g)]
    .map((match) => match[1])
    .filter((value): value is string => Boolean(value));
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const record = value as JsonRecord;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function expectedContentHash(graph: unknown, inputSchema: unknown): string {
  return `sha256:v1:${createHash('sha256')
    .update(stableStringify({ graph, inputSchema }))
    .digest('hex')}`;
}

async function createLegacyWorkflowSchema(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE "users" ("id" text PRIMARY KEY);
    CREATE TABLE "organizations" ("id" text PRIMARY KEY);
    CREATE TABLE "workflows" (
      "id" text PRIMARY KEY,
      "organizationId" text NOT NULL REFERENCES "organizations"("id"),
      "userId" text NOT NULL REFERENCES "users"("id"),
      "nodes" jsonb NOT NULL DEFAULT '[]',
      "edges" jsonb NOT NULL DEFAULT '[]',
      "steps" jsonb NOT NULL DEFAULT '[]',
      "inputVariables" jsonb NOT NULL DEFAULT '[]',
      "lockedNodeIds" jsonb NOT NULL DEFAULT '[]',
      "metadata" jsonb,
      "isDeleted" boolean NOT NULL DEFAULT false,
      "isScheduleEnabled" boolean,
      "createdAt" timestamp NOT NULL DEFAULT now(),
      "updatedAt" timestamp NOT NULL DEFAULT now()
    );
    CREATE TABLE "workflow_executions" (
      "id" text PRIMARY KEY,
      "workflowId" text NOT NULL REFERENCES "workflows"("id"),
      "organizationId" text NOT NULL REFERENCES "organizations"("id"),
      "userId" text NOT NULL REFERENCES "users"("id"),
      "status" text NOT NULL DEFAULT 'PENDING',
      "createdAt" timestamp NOT NULL DEFAULT now()
    );
    CREATE TABLE "batch_workflow_jobs" (
      "id" text PRIMARY KEY,
      "workflowId" text NOT NULL REFERENCES "workflows"("id")
    );
    INSERT INTO "users" ("id")
    VALUES ('user_fixture'), ('user_other');
    INSERT INTO "organizations" ("id")
    VALUES ('org_fixture'), ('org_other');
  `);
}

async function openMigrationFixture(prefix: string): Promise<MigrationFixture> {
  fixtureSequence += 1;
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
  });
  const client = await pool.connect();
  const schemaName = `${prefix}_${process.pid}_${Date.now()}_${fixtureSequence}`;
  await client.query(`CREATE SCHEMA "${schemaName}"`);
  await client.query(`SET search_path TO "${schemaName}", public`);
  await createLegacyWorkflowSchema(client);
  return { client, pool, schemaName };
}

async function closeMigrationFixture(fixture: MigrationFixture): Promise<void> {
  const { client, pool, schemaName } = fixture;
  await client.query('ROLLBACK').catch(() => undefined);
  await client.query('SET search_path TO public');
  await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  client.release();
  await pool.end();
}

async function runRejectedMigration(
  client: PoolClient,
  expectedError: RegExp,
  source = migrationSource,
): Promise<void> {
  await expect(client.query(source)).rejects.toThrow(expectedError);
  await client.query('ROLLBACK');
}

async function expectLegacySchemaIntact(client: PoolClient): Promise<void> {
  const versionTable = await client.query<{ table_exists: boolean }>(`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_name = 'workflow_versions'
    ) AS table_exists
  `);
  expect(versionTable.rows[0]?.table_exists).toBe(false);

  const legacyColumns = await client.query<{ column_name: string }>(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'workflows'
      AND column_name IN ('steps', 'nodes', 'edges', 'inputVariables', 'lockedNodeIds')
    ORDER BY column_name
  `);
  expect(legacyColumns.rows.map((row) => row.column_name)).toEqual([
    'edges',
    'inputVariables',
    'lockedNodeIds',
    'nodes',
    'steps',
  ]);
}

function graphNode(
  id: string,
  type: string,
  data: JsonRecord = {},
): JsonRecord {
  return {
    data: { label: id, ...data },
    id,
    position: { x: 0, y: 0 },
    type,
  };
}

function retiredSeededSystemWorkflowMetadata(canonicalId: string): JsonRecord {
  return {
    sourceTemplateId: canonicalId,
    sourceType: 'system-action-workflow',
    systemWorkflow: {
      canonicalId,
      immutable: true,
      kind: 'system-workflow',
      owner: 'genfeed',
      visibility: 'organization',
    },
  };
}

function retiredSeededMacroWorkflowMetadata(canonicalId: string): JsonRecord {
  return {
    sourceTemplateId: canonicalId,
    sourceType: 'seeded-template',
    systemWorkflow: {
      canonicalId,
      immutable: true,
      kind: 'system-workflow',
      owner: 'genfeed',
      visibility: 'organization',
    },
  };
}

describe('immutable workflow version migration', () => {
  it('owns one atomic hard-cut transaction', () => {
    expect(migrationSource.trimStart().startsWith('BEGIN;')).toBe(true);
    expect(migrationSource.trimEnd().endsWith('COMMIT;')).toBe(true);
    expect(migrationSource).toContain(
      'CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public',
    );
    expect(migrationSource).toContain('DROP COLUMN "steps"');
    expect(migrationSource).toContain('DROP COLUMN "nodes"');
    expect(migrationSource).toContain('DROP COLUMN "edges"');
  });

  it('freezes all 17 legacy step categories as one conversion and 16 explicit rejections', () => {
    expect(legacyStepCategories).toHaveLength(17);
    expect(new Set(legacyStepCategories).size).toBe(17);
    expect(migrationSource).toContain(
      `step_record.value->>'category' = 'delay'`,
    );
    for (const category of rejectedLegacyStepCategories) {
      expect(migrationSource).toContain(`WHEN '${category}' THEN`);
    }
    expect(migrationSource).not.toContain(
      'CREATE FUNCTION workflow_step_action_id',
    );
  });

  it('keeps the SQL executor snapshot in parity with registered atomic executors', () => {
    expect(migrationSource).toContain(
      'CREATE FUNCTION workflow_action_has_atomic_executor(action_id TEXT)',
    );
    expect(migrationSource).toContain(
      'OR NOT workflow_action_has_atomic_executor(action_id)',
    );
    const engineNativeExecutorNodeTypes = new Set(
      sqlStringLiterals(
        actionNodeSource.match(
          /ENGINE_NATIVE_NODE_TYPES[\s\S]*?new Set\(\[([\s\S]*?)\]\)/,
        )?.[1] ?? '',
      ),
    );
    const expectedAtomicActionIds = [
      ...registeredExecutorNodeTypes().filter(
        (nodeType) => !engineNativeExecutorNodeTypes.has(nodeType),
      ),
      ...workflowControlActionIds,
    ].sort();
    const atomicActionIds = sqlStringLiterals(atomicExecutorSnapshot).sort();
    const supportedActionIds = new Set(
      sqlStringLiterals(supportedActionSnapshot),
    );

    expect(new Set(expectedAtomicActionIds).size).toBe(
      expectedAtomicActionIds.length,
    );
    expect(atomicActionIds).toEqual(expectedAtomicActionIds);
    expect(
      expectedAtomicActionIds.filter(
        (actionId) => !supportedActionIds.has(actionId),
      ),
    ).toEqual([]);
    for (const sentinel of nonActionSentinels) {
      expect(atomicActionIds).not.toContain(sentinel);
    }
    expect(migrationSource).toContain('references removed macro');
    expect(migrationSource).toContain('has unconvertible legacy type');
  });

  it('removes only unexecuted legacy seeded system mirrors before versioning', () => {
    expect(seededSystemCleanupMigrationSource).toContain(
      'CREATE FUNCTION workflow_is_retired_seeded_system_clone',
    );
    expect(seededSystemCleanupMigrationSource).toContain(
      `@.type == "systemWorkflowAction"`,
    );
    expect(seededSystemCleanupMigrationSource).toContain(
      `workflow_metadata->>'sourceType' = 'system-action-workflow'`,
    );
    expect(seededSystemCleanupMigrationSource).toContain(
      `workflow_metadata->'systemWorkflow'->'immutable' = 'true'::jsonb`,
    );
    expect(seededSystemCleanupMigrationSource).toContain(
      'jsonb_array_length(workflow_nodes) = 1',
    );
    expect(seededSystemCleanupMigrationSource).toContain(
      `workflow_nodes->0->'data'->'config'->>'canonicalId'`,
    );
    expect(seededSystemCleanupMigrationSource).toContain('SELECT COALESCE(');
    expect(seededSystemCleanupMigrationSource).toContain(
      'FROM "batch_workflow_jobs" batch_job',
    );
    expect(seededSystemCleanupMigrationSource).toContain(
      'DELETE FROM "workflows" workflow',
    );
    expect(seededSystemCleanupMigrationSource).toContain(
      "column_name = 'nodes'",
    );
    expect(migrationSource).not.toContain(
      'workflow_is_retired_seeded_system_clone',
    );
  });

  it('pins identity and every execution to tenant-owned immutable v1', () => {
    expect(migrationSource).toContain(
      'ALTER TABLE "workflows" ALTER COLUMN "currentVersionId" SET NOT NULL',
    );
    expect(migrationSource).toMatch(
      /ADD CONSTRAINT "workflows_currentVersionId_fkey"[\s\S]*?DEFERRABLE INITIALLY DEFERRED/,
    );
    expect(migrationSource).toContain(
      'ALTER TABLE "workflow_executions" ALTER COLUMN "workflowVersionId" SET NOT NULL',
    );
    expect(migrationSource).toContain(
      'version."organizationId" = execution."organizationId"',
    );
    expect(migrationSource).toContain('version."userId" = execution."userId"');
    expect(migrationSource).toContain(
      'FOREIGN KEY ("workflowVersionId") REFERENCES "workflow_versions"("id")',
    );
  });

  it('uses the runtime sha256:v1 stable-key hash contract', () => {
    expect(migrationSource).toContain('CREATE FUNCTION workflow_stable_json');
    expect(migrationSource).toContain(`ORDER BY entry.key COLLATE "C"`);
    expect(migrationSource).toContain(`'sha256:v1:' || encode(`);
    expect(migrationSource).toContain(`'sha256'`);
    expect(migrationSource).not.toContain('md5(');
  });
});

const databaseUrl = process.env.DATABASE_URL;
const describePostgres = databaseUrl ? describe : describe.skip;

describePostgres('immutable workflow version migration on PostgreSQL', () => {
  it('retires only exact seeded macro clones while preserving their history', async () => {
    const fixture = await openMigrationFixture('workflow_version_seeded_macro');
    const { client } = fixture;
    const nodes = [
      graphNode('legacy_macro', 'proactiveAgentStrategies', { config: {} }),
    ];

    try {
      await client.query(
        `
          INSERT INTO "workflows"
            ("id", "organizationId", "userId", "nodes", "metadata", "isScheduleEnabled")
          VALUES
            ('workflow_seeded_macro', 'org_fixture', 'user_fixture', $1::jsonb, $2::jsonb, true)
        `,
        [
          JSON.stringify(nodes),
          JSON.stringify(
            retiredSeededMacroWorkflowMetadata('proactive-agent-strategies'),
          ),
        ],
      );
      await client.query(`
        INSERT INTO "workflow_executions"
          ("id", "workflowId", "organizationId", "userId")
        VALUES
          ('execution_seeded_macro', 'workflow_seeded_macro', 'org_fixture', 'user_fixture')
      `);

      await client.query(migrationSource);

      const workflow = await client.query<{
        currentVersionId: string;
        isDeleted: boolean;
        isScheduleEnabled: boolean;
      }>(`
        SELECT "currentVersionId", "isDeleted", "isScheduleEnabled"
        FROM "workflows"
        WHERE "id" = 'workflow_seeded_macro'
      `);
      expect(workflow.rows).toEqual([
        {
          currentVersionId: 'wv_legacy_workflow_seeded_macro',
          isDeleted: true,
          isScheduleEnabled: false,
        },
      ]);

      const version = await client.query<{
        actionId: string;
        workflowVersionId: string;
      }>(`
        SELECT
          version."graph"->'nodes'->0->'data'->'config'->>'actionId' AS "actionId",
          execution."workflowVersionId"
        FROM "workflow_versions" version
        JOIN "workflow_executions" execution
          ON execution."workflowId" = version."workflowId"
        WHERE version."workflowId" = 'workflow_seeded_macro'
      `);
      expect(version.rows).toEqual([
        {
          actionId: 'proactiveAgentStrategies',
          workflowVersionId: 'wv_legacy_workflow_seeded_macro',
        },
      ]);
    } finally {
      await closeMigrationFixture(fixture);
    }
  });

  it('converts equivalent graph aliases/data fields and delay millisecond boundaries', async () => {
    const fixture = await openMigrationFixture('workflow_version_cutover');
    const { client } = fixture;

    try {
      const graphNodes = [
        graphNode('input_node', 'workflow-input', {
          config: {},
          label: 'Input',
        }),
        graphNode('prompt_node', 'input-prompt', {
          config: { required: true, text: 'Write a fixture' },
          inputVariableKeys: ['topic'],
          label: 'Prompt',
        }),
        graphNode('image_input_node', 'imageInput', {
          config: { image: 'https://example.com/image.png' },
          label: 'Image',
        }),
        graphNode('video_node', 'ai-generate-video', {
          aspectRatio: '16:9',
          label: 'Video',
          model: 'wan-fixture',
          prompt: 'fixture prompt',
        }),
        graphNode('llm_node', 'genfeedAction', {
          config: {
            actionId: 'llm',
            parameters: { model: 'fixture-model', temperature: 0.25 },
          },
          label: 'LLM',
        }),
        graphNode('output_node', 'download', {
          config: {},
          label: 'Output',
        }),
        graphNode('condition_node', 'condition', {
          config: { operator: 'isTrue' },
          label: 'Condition',
        }),
      ];
      const graphEdges = [
        { id: 'input_to_video', source: 'input_node', target: 'video_node' },
        { id: 'video_to_llm', source: 'video_node', target: 'llm_node' },
        { id: 'llm_to_output', source: 'llm_node', target: 'output_node' },
      ];
      const delaySteps = [
        { category: 'delay', dependsOn: [], id: 'delay_default' },
        {
          category: 'delay',
          config: { duration: 0 },
          dependsOn: ['delay_default'],
          id: 'delay_zero',
        },
        {
          category: 'delay',
          config: { duration: 1250 },
          dependsOn: ['delay_zero'],
          id: 'delay_fractional_seconds',
        },
        {
          category: 'delay',
          config: { duration: 2_592_000_000 },
          dependsOn: ['delay_fractional_seconds'],
          id: 'delay_maximum',
        },
      ];
      const inputVariables = [
        {
          key: 'topic',
          label: 'Topic',
          type: 'string',
          validation: { pattern: '.+', options: ['one', 'two'] },
        },
        { key: 'count', label: 'Count', required: true, type: 'number' },
      ];

      await client.query(
        `
          INSERT INTO "workflows"
            ("id", "organizationId", "userId", "nodes", "edges", "steps", "inputVariables", "lockedNodeIds")
          VALUES
            ('workflow_graph', 'org_fixture', 'user_fixture', $1::jsonb, $2::jsonb, '[]'::jsonb, $3::jsonb, '["input_node"]'::jsonb),
            ('workflow_delay', 'org_fixture', 'user_fixture', '[]'::jsonb, '[]'::jsonb, $4::jsonb, '[]'::jsonb, '[]'::jsonb)
        `,
        [
          JSON.stringify(graphNodes),
          JSON.stringify(graphEdges),
          JSON.stringify(inputVariables),
          JSON.stringify(delaySteps),
        ],
      );
      await client.query(`
        INSERT INTO "workflow_executions"
          ("id", "workflowId", "organizationId", "userId", "status")
        VALUES
          ('execution_pending', 'workflow_graph', 'org_fixture', 'user_fixture', 'PENDING'),
          ('execution_running', 'workflow_graph', 'org_fixture', 'user_fixture', 'RUNNING'),
          ('execution_completed', 'workflow_graph', 'org_fixture', 'user_fixture', 'COMPLETED')
      `);

      await client.query(seededSystemCleanupMigrationSource);
      await client.query(migrationSource);

      const versions = await client.query<{
        contentHash: string;
        graph: {
          edges: JsonRecord[];
          lockedNodeIds: string[];
          nodes: Array<{
            data: { config: JsonRecord; label: string };
            id: string;
            type: string;
          }>;
        };
        inputSchema: JsonRecord[];
        workflowId: string;
      }>(`
        SELECT "workflowId", "graph", "inputSchema", "contentHash"
        FROM "workflow_versions"
        ORDER BY "workflowId"
      `);
      const graphVersion = versions.rows.find(
        (version) => version.workflowId === 'workflow_graph',
      );
      const delayVersion = versions.rows.find(
        (version) => version.workflowId === 'workflow_delay',
      );

      expect(graphVersion?.graph.nodes.map((node) => node.id)).toEqual(
        graphNodes.map((node) => node.id),
      );
      expect(graphVersion?.graph.nodes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'input_node', type: 'workflowInput' }),
          expect.objectContaining({
            data: expect.objectContaining({
              config: expect.objectContaining({
                defaultValue: 'Write a fixture',
                inputName: 'prompt_node',
                inputType: 'text',
                required: true,
              }),
            }),
            id: 'prompt_node',
            type: 'workflowInput',
          }),
          expect.objectContaining({
            data: expect.objectContaining({
              config: expect.objectContaining({
                defaultValue: 'https://example.com/image.png',
                inputName: 'image_input_node',
                inputType: 'image',
              }),
            }),
            id: 'image_input_node',
            type: 'workflowInput',
          }),
          expect.objectContaining({
            data: expect.objectContaining({
              config: expect.objectContaining({
                actionId: 'videoGen',
                parameters: {
                  aspectRatio: '16:9',
                  model: 'wan-fixture',
                  prompt: 'fixture prompt',
                },
              }),
            }),
            id: 'video_node',
            type: 'genfeedAction',
          }),
          expect.objectContaining({
            data: expect.objectContaining({
              config: {
                actionId: 'llm',
                parameters: { model: 'fixture-model', temperature: 0.25 },
              },
            }),
            id: 'llm_node',
            type: 'genfeedAction',
          }),
          expect.objectContaining({
            data: expect.objectContaining({
              config: expect.objectContaining({
                actionId: 'workflow.collect-output',
              }),
            }),
            id: 'output_node',
            type: 'genfeedAction',
          }),
          expect.objectContaining({
            id: 'condition_node',
            type: 'condition',
          }),
        ]),
      );
      expect(graphVersion?.inputSchema).toEqual([
        { ...inputVariables[0], required: false },
        inputVariables[1],
      ]);
      expect(graphVersion?.contentHash).toBe(
        expectedContentHash(graphVersion?.graph, graphVersion?.inputSchema),
      );

      expect(delayVersion?.graph.nodes.map((node) => node.data.config)).toEqual(
        [
          { duration: 1, mode: 'fixed', unit: 'seconds' },
          { duration: 1, mode: 'fixed', unit: 'seconds' },
          { duration: 1.25, mode: 'fixed', unit: 'seconds' },
          { duration: 2_592_000, mode: 'fixed', unit: 'seconds' },
        ],
      );
      expect(delayVersion?.graph.edges).toEqual([
        {
          id: 'delay_default-delay_zero',
          source: 'delay_default',
          target: 'delay_zero',
        },
        {
          id: 'delay_zero-delay_fractional_seconds',
          source: 'delay_zero',
          target: 'delay_fractional_seconds',
        },
        {
          id: 'delay_fractional_seconds-delay_maximum',
          source: 'delay_fractional_seconds',
          target: 'delay_maximum',
        },
      ]);

      const executions = await client.query<{
        workflowVersionId: string;
      }>(`
        SELECT "workflowVersionId"
        FROM "workflow_executions"
        ORDER BY "id"
      `);
      expect(
        executions.rows.map((execution) => execution.workflowVersionId),
      ).toEqual([
        'wv_legacy_workflow_graph',
        'wv_legacy_workflow_graph',
        'wv_legacy_workflow_graph',
      ]);

      const identity = await client.query<{
        currentVersionId: string;
      }>(`
        SELECT "currentVersionId"
        FROM "workflows"
        WHERE "id" = 'workflow_graph'
      `);
      expect(identity.rows[0]?.currentVersionId).toBe(
        'wv_legacy_workflow_graph',
      );

      const currentVersionColumn = await client.query<{
        is_nullable: string;
      }>(`
        SELECT is_nullable
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'workflows'
          AND column_name = 'currentVersionId'
      `);
      expect(currentVersionColumn.rows[0]?.is_nullable).toBe('NO');

      const legacyColumns = await client.query<{ column_name: string }>(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'workflows'
          AND column_name IN ('steps', 'nodes', 'edges', 'inputVariables', 'lockedNodeIds')
      `);
      expect(legacyColumns.rows).toEqual([]);

      const currentVersionConstraint = await client.query<{
        condeferrable: boolean;
        condeferred: boolean;
      }>(`
        SELECT condeferrable, condeferred
        FROM pg_constraint
        WHERE conname = 'workflows_currentVersionId_fkey'
          AND conrelid = 'workflows'::regclass
      `);
      expect(currentVersionConstraint.rows).toEqual([
        { condeferrable: true, condeferred: true },
      ]);

      await client.query('BEGIN');
      await client.query(`
        INSERT INTO "workflows"
          ("id", "organizationId", "userId", "currentVersionId")
        VALUES
          ('workflow_new', 'org_fixture', 'user_fixture', 'version_new');
        INSERT INTO "workflow_versions"
          ("id", "workflowId", "organizationId", "userId", "version", "graph", "inputSchema", "contentHash")
        VALUES
          ('version_new', 'workflow_new', 'org_fixture', 'user_fixture', 1,
           '{"nodes":[],"edges":[],"lockedNodeIds":[]}'::jsonb, '[]'::jsonb,
           'sha256:v1:fixture');
      `);
      await client.query('COMMIT');
    } finally {
      await closeMigrationFixture(fixture);
    }
  });

  it('deletes retired seeded system mirrors while versioning executable workflows', async () => {
    const fixture = await openMigrationFixture(
      'workflow_version_seeded_system',
    );
    const { client } = fixture;
    const retiredNodes = [
      graphNode('system_action', 'systemWorkflowAction', {
        config: { canonicalId: 'scheduled-publish' },
      }),
    ];
    const executableNodes = [graphNode('llm_node', 'llm', { config: {} })];

    try {
      await client.query(
        `
          INSERT INTO "workflows"
            ("id", "organizationId", "userId", "nodes", "metadata")
          VALUES
            ('workflow_retired', 'org_fixture', 'user_fixture', $1::jsonb, $2::jsonb),
            ('workflow_executable', 'org_fixture', 'user_fixture', $3::jsonb, NULL)
        `,
        [
          JSON.stringify(retiredNodes),
          JSON.stringify(
            retiredSeededSystemWorkflowMetadata('scheduled-publish'),
          ),
          JSON.stringify(executableNodes),
        ],
      );

      await client.query(seededSystemCleanupMigrationSource);
      await client.query(migrationSource);

      const workflows = await client.query<{ id: string }>(`
        SELECT "id" FROM "workflows" ORDER BY "id"
      `);
      expect(workflows.rows).toEqual([{ id: 'workflow_executable' }]);

      const versions = await client.query<{
        id: string;
        workflowId: string;
      }>(`
        SELECT "id", "workflowId"
        FROM "workflow_versions"
        ORDER BY "workflowId"
      `);
      expect(versions.rows).toEqual([
        {
          id: 'wv_legacy_workflow_executable',
          workflowId: 'workflow_executable',
        },
      ]);
    } finally {
      await closeMigrationFixture(fixture);
    }
  });

  it('rejects legacy system actions without exact retired-seeder provenance', async () => {
    const fixture = await openMigrationFixture(
      'workflow_version_system_provenance',
    );
    const { client } = fixture;
    const nodes = [
      graphNode('system_action', 'systemWorkflowAction', {
        config: { canonicalId: 'customer-template' },
      }),
    ];

    try {
      await client.query(
        `
          INSERT INTO "workflows"
            ("id", "organizationId", "userId", "nodes", "metadata")
          VALUES
            ('workflow_customer', 'org_fixture', 'user_fixture', $1::jsonb, $2::jsonb)
        `,
        [
          JSON.stringify(nodes),
          JSON.stringify({
            sourceTemplateId: 'customer-template',
            sourceType: 'catalog-install',
          }),
        ],
      );

      await runRejectedMigration(
        client,
        /legacy systemWorkflowAction nodes without exact retired seeded-system provenance/,
        seededSystemCleanupMigrationSource,
      );
      await expectLegacySchemaIntact(client);

      await client.query(`
        UPDATE "workflows"
        SET "metadata" = NULL
        WHERE "id" = 'workflow_customer'
      `);
      await runRejectedMigration(
        client,
        /legacy systemWorkflowAction nodes without exact retired seeded-system provenance/,
        seededSystemCleanupMigrationSource,
      );
      await expectLegacySchemaIntact(client);

      await client.query(
        `
          UPDATE "workflows"
          SET "nodes" = $1::jsonb,
              "metadata" = $2::jsonb
          WHERE "id" = 'workflow_customer'
        `,
        [
          JSON.stringify([
            ...nodes,
            graphNode('executable_action', 'llm', { config: {} }),
          ]),
          JSON.stringify(
            retiredSeededSystemWorkflowMetadata('customer-template'),
          ),
        ],
      );
      await runRejectedMigration(
        client,
        /legacy systemWorkflowAction nodes without exact retired seeded-system provenance/,
        seededSystemCleanupMigrationSource,
      );
      await expectLegacySchemaIntact(client);

      const workflows = await client.query<{ id: string }>(`
        SELECT "id" FROM "workflows"
      `);
      expect(workflows.rows).toEqual([{ id: 'workflow_customer' }]);
    } finally {
      await closeMigrationFixture(fixture);
    }
  });

  it('rejects retired seeded system mirrors referenced by either legacy execution path', async () => {
    const fixture = await openMigrationFixture(
      'workflow_version_system_history',
    );
    const { client } = fixture;
    const nodes = [
      graphNode('system_action', 'systemWorkflowAction', {
        config: { canonicalId: 'scheduled-publish' },
      }),
    ];

    try {
      await client.query(
        `
          INSERT INTO "workflows"
            ("id", "organizationId", "userId", "nodes", "metadata")
          VALUES
            ('workflow_retired', 'org_fixture', 'user_fixture', $1::jsonb, $2::jsonb)
        `,
        [
          JSON.stringify(nodes),
          JSON.stringify(
            retiredSeededSystemWorkflowMetadata('scheduled-publish'),
          ),
        ],
      );
      await client.query(`
        INSERT INTO "workflow_executions"
          ("id", "workflowId", "organizationId", "userId")
        VALUES
          ('execution_retired', 'workflow_retired', 'org_fixture', 'user_fixture')
      `);

      await runRejectedMigration(
        client,
        /Retired seeded system workflows have execution history and cannot be removed automatically/,
        seededSystemCleanupMigrationSource,
      );
      await expectLegacySchemaIntact(client);

      await client.query(`
        DELETE FROM "workflow_executions"
        WHERE "workflowId" = 'workflow_retired';
        INSERT INTO "batch_workflow_jobs" ("id", "workflowId")
        VALUES ('batch_retired', 'workflow_retired');
      `);

      await runRejectedMigration(
        client,
        /Retired seeded system workflows have execution history and cannot be removed automatically/,
        seededSystemCleanupMigrationSource,
      );
      await expectLegacySchemaIntact(client);
    } finally {
      await closeMigrationFixture(fixture);
    }
  });

  it('is a no-op when a community database already applied the immutable cutover', async () => {
    const fixture = await openMigrationFixture(
      'workflow_version_cleanup_after_cutover',
    );
    const { client } = fixture;

    try {
      await client.query(
        `
          INSERT INTO "workflows"
            ("id", "organizationId", "userId", "nodes")
          VALUES ('workflow_existing', 'org_fixture', 'user_fixture', $1::jsonb)
        `,
        [JSON.stringify([graphNode('llm_node', 'llm', { config: {} })])],
      );

      await client.query(migrationSource);
      await client.query(seededSystemCleanupMigrationSource);

      const workflows = await client.query<{ id: string }>(`
        SELECT "id" FROM "workflows" ORDER BY "id"
      `);
      expect(workflows.rows).toEqual([{ id: 'workflow_existing' }]);

      const versions = await client.query<{ workflowId: string }>(`
        SELECT "workflowId" FROM "workflow_versions" ORDER BY "workflowId"
      `);
      expect(versions.rows).toEqual([{ workflowId: 'workflow_existing' }]);
    } finally {
      await closeMigrationFixture(fixture);
    }
  });

  it('rejects all 16 non-equivalent step categories and rolls every attempt back', async () => {
    const fixture = await openMigrationFixture('workflow_version_steps');
    const { client } = fixture;

    try {
      await client.query(`
        INSERT INTO "workflows" ("id", "organizationId", "userId")
        VALUES ('workflow_rejected', 'org_fixture', 'user_fixture')
      `);

      for (const category of rejectedLegacyStepCategories) {
        const steps = [{ category, id: 'step_rejected' }];
        await client.query(
          `UPDATE "workflows" SET "steps" = $1::jsonb WHERE "id" = 'workflow_rejected'`,
          [JSON.stringify(steps)],
        );
        await runRejectedMigration(
          client,
          new RegExp(
            `Workflow workflow_rejected step step_rejected has unconvertible category ${category}:`,
          ),
        );
        await expectLegacySchemaIntact(client);
        const persisted = await client.query<{ steps: JsonRecord[] }>(`
          SELECT "steps" FROM "workflows" WHERE "id" = 'workflow_rejected'
        `);
        expect(persisted.rows[0]?.steps).toEqual(steps);
      }
    } finally {
      await closeMigrationFixture(fixture);
    }
  });

  it('rejects unregistered graph actions and preserves legacy data after rollback', async () => {
    const fixture = await openMigrationFixture('workflow_version_action');
    const { client } = fixture;
    const nodes = [graphNode('unknown_node', 'removedLegacyNode')];

    try {
      await client.query(
        `
          INSERT INTO "workflows"
            ("id", "organizationId", "userId", "nodes")
          VALUES ('workflow_unknown', 'org_fixture', 'user_fixture', $1::jsonb)
        `,
        [JSON.stringify(nodes)],
      );

      await runRejectedMigration(
        client,
        /Workflow workflow_unknown action node unknown_node references unsupported or unregistered atomic action removedLegacyNode/,
      );
      await expectLegacySchemaIntact(client);
      const persisted = await client.query<{ nodes: JsonRecord[] }>(`
        SELECT "nodes" FROM "workflows" WHERE "id" = 'workflow_unknown'
      `);
      expect(persisted.rows[0]?.nodes).toEqual(nodes);

      const macroNodes = [
        graphNode('macro_node', 'genfeedAction', {
          config: {
            actionId: 'content.optimization.cycle.run',
            parameters: {},
          },
        }),
      ];
      await client.query(
        `UPDATE "workflows" SET "nodes" = $1::jsonb WHERE "id" = 'workflow_unknown'`,
        [JSON.stringify(macroNodes)],
      );
      await runRejectedMigration(
        client,
        /Workflow workflow_unknown action node macro_node references removed macro content\.optimization\.cycle\.run:/,
      );
      await expectLegacySchemaIntact(client);
    } finally {
      await closeMigrationFixture(fixture);
    }
  });

  it('rejects invalid graph/input documents before immutable persistence', async () => {
    const fixture = await openMigrationFixture('workflow_version_invalid');
    const { client } = fixture;
    const validNodeA = graphNode('node_a', 'llm', { config: {} });
    const validNodeB = graphNode('node_b', 'llm', { config: {} });
    const invalidCases: Array<{
      edges?: JsonRecord[];
      error: RegExp;
      inputVariables?: JsonRecord[];
      lockedNodeIds?: string[];
      nodes: JsonRecord[];
      steps?: JsonRecord[];
    }> = [
      {
        error: /graph contains duplicate node ids/,
        nodes: [validNodeA, validNodeA],
      },
      {
        edges: [{ id: 'dangling', source: 'node_a', target: 'missing' }],
        error: /graph contains a dangling edge/,
        nodes: [validNodeA],
      },
      {
        edges: [
          { id: 'a-b', source: 'node_a', target: 'node_b' },
          { id: 'b-a', source: 'node_b', target: 'node_a' },
        ],
        error: /graph contains a cycle/,
        nodes: [validNodeA, validNodeB],
      },
      {
        error: /graph contains an unknown locked node id/,
        lockedNodeIds: ['missing'],
        nodes: [validNodeA],
      },
      {
        error: /graph contains a malformed node/,
        nodes: [{ ...validNodeA, position: { x: 'bad', y: 0 } }],
      },
      {
        error: /parameters must be an object/,
        nodes: [
          graphNode('bad_parameters', 'genfeedAction', {
            config: { actionId: 'llm', parameters: [] },
          }),
        ],
      },
      {
        error: /graph exceeds the 500-node limit/,
        nodes: Array.from({ length: 501 }, (_, index) =>
          graphNode(`node_${index}`, 'llm', { config: {} }),
        ),
      },
      {
        error: /inputVariables contains duplicate keys/,
        inputVariables: [
          { key: 'topic', label: 'Topic', type: 'text' },
          { key: 'topic', label: 'Other topic', type: 'text' },
        ],
        nodes: [validNodeA],
      },
      {
        error: /validation.options must be a string array/,
        inputVariables: [
          {
            key: 'topic',
            label: 'Topic',
            type: 'select',
            validation: { options: ['valid', 2] },
          },
        ],
        nodes: [validNodeA],
      },
      {
        error: /contains both legacy graph nodes and steps/,
        nodes: [validNodeA],
        steps: [{ category: 'delay', id: 'delay' }],
      },
      {
        edges: [{ id: 'orphan', source: 'missing_a', target: 'missing_b' }],
        error: /has legacy edges without graph nodes/,
        nodes: [],
      },
    ];

    try {
      await client.query(`
        INSERT INTO "workflows" ("id", "organizationId", "userId")
        VALUES ('workflow_invalid', 'org_fixture', 'user_fixture')
      `);

      for (const invalidCase of invalidCases) {
        await client.query(
          `
            UPDATE "workflows"
            SET "nodes" = $1::jsonb,
                "edges" = $2::jsonb,
                "lockedNodeIds" = $3::jsonb,
                "inputVariables" = $4::jsonb,
                "steps" = $5::jsonb
            WHERE "id" = 'workflow_invalid'
          `,
          [
            JSON.stringify(invalidCase.nodes),
            JSON.stringify(invalidCase.edges ?? []),
            JSON.stringify(invalidCase.lockedNodeIds ?? []),
            JSON.stringify(invalidCase.inputVariables ?? []),
            JSON.stringify(invalidCase.steps ?? []),
          ],
        );
        await runRejectedMigration(client, invalidCase.error);
        await expectLegacySchemaIntact(client);
      }
    } finally {
      await closeMigrationFixture(fixture);
    }
  });

  it('rejects cross-tenant execution ownership before version pinning', async () => {
    const fixture = await openMigrationFixture('workflow_version_tenant');
    const { client } = fixture;

    try {
      await client.query(
        `
          INSERT INTO "workflows"
            ("id", "organizationId", "userId", "nodes")
          VALUES ('workflow_tenant', 'org_fixture', 'user_fixture', $1::jsonb)
        `,
        [JSON.stringify([graphNode('node_a', 'llm', { config: {} })])],
      );
      await client.query(`
        INSERT INTO "workflow_executions"
          ("id", "workflowId", "organizationId", "userId")
        VALUES ('execution_cross_tenant', 'workflow_tenant', 'org_other', 'user_other')
      `);

      await runRejectedMigration(
        client,
        /Workflow executions contain orphaned or cross-tenant workflow ownership/,
      );
      await expectLegacySchemaIntact(client);
    } finally {
      await closeMigrationFixture(fixture);
    }
  });
});
