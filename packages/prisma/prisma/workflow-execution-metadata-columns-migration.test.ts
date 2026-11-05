import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function statement(migration: string): string {
  return readFileSync(
    new URL(`./migrations/${migration}/migration.sql`, import.meta.url),
    'utf8',
  )
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/\( /g, '(')
    .replace(/ \)/g, ')')
    .trim();
}

const schema = readFileSync(
  new URL('./schema.prisma', import.meta.url),
  'utf8',
);

describe('workflow execution metadata columns', () => {
  it('declares the promoted columns on WorkflowExecution', () => {
    const model = schema.slice(
      schema.indexOf('model WorkflowExecution {'),
      schema.indexOf('@@map("workflow_executions")'),
    );
    expect(model).toMatch(/canonicalId\s+String\?/);
    expect(model).toMatch(/source\s+String\?/);
    expect(model).toMatch(/strategyId\s+String\?/);
    expect(model).not.toMatch(/\bbrandId\s/);
    expect(model).toMatch(/threadId\s+String\?/);
    expect(model).toMatch(/dispatchClass\s+String\?/);
    expect(model).toMatch(/dispatchId\s+String\?/);
    expect(model).toMatch(/campaignId\s+String\?/);
    expect(model).toMatch(/isSystemAction\s+Boolean @default\(false\)/);
  });

  it('fills the columns for every insert from result.metadata', () => {
    const sql = statement('20261105090000_workflow_execution_metadata_columns');
    expect(sql).toContain(
      'ADD COLUMN IF NOT EXISTS "isSystemAction" BOOLEAN NOT NULL DEFAULT false',
    );
    expect(sql).toContain(
      `SELECT CASE WHEN jsonb_typeof(metadata -> key) = 'string' THEN metadata ->> key END`,
    );
    expect(sql).toContain(
      'CREATE TRIGGER "workflow_execution_metadata_promotion" BEFORE INSERT ON "workflow_executions" FOR EACH ROW EXECUTE FUNCTION "promote_workflow_execution_metadata"();',
    );
  });

  it('backfills existing rows in committed batches, as the only statement', () => {
    const sql = statement(
      '20261105090050_backfill_workflow_execution_metadata_columns',
    );
    expect(sql.startsWith('DO $$')).toBe(true);
    expect(sql.endsWith('$$;')).toBe(true);
    expect(sql.match(/\$\$/g)).toHaveLength(2);
    expect(sql).toContain('AND "id" <= upper_bound');
    expect(sql).toContain('LIMIT 2000');
    expect(sql).toContain('COMMIT;');
    expect(sql).toContain(`'workflow_execution_metadata_columns_20261105'`);
  });

  it.each([
    [
      '20261105090100_workflow_execution_thread_index',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS "workflow_executions_thread_idx" ON "workflow_executions" ("organizationId", "isDeleted", "threadId", "canonicalId", "createdAt" DESC, "id" DESC);',
    ],
    [
      '20261105090150_workflow_execution_thread_created_index',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS "workflow_executions_thread_created_idx" ON "workflow_executions" ("organizationId", "isDeleted", "threadId", "createdAt" DESC, "id" DESC);',
    ],
    [
      '20261105090200_workflow_execution_proactive_turn_brand_index',
      `CREATE INDEX CONCURRENTLY IF NOT EXISTS "workflow_executions_proactive_turn_brand_idx" ON "workflow_executions" ("organizationId", (result #> '{metadata,brandId}'::text[]), "createdAt" DESC) WHERE "isDeleted" = false AND "source" = 'proactive' AND "canonicalId" = 'agent.turn.execute' AND "strategyId" IS NOT NULL;`,
    ],
    [
      '20261105090400_workflow_execution_dispatch_id_index',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS "workflow_executions_dispatch_id_idx" ON "workflow_executions" ("organizationId", "dispatchId") WHERE "dispatchId" IS NOT NULL;',
    ],
    [
      '20261105090500_workflow_execution_campaign_index',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS "workflow_executions_campaign_idx" ON "workflow_executions" ("organizationId", "campaignId", "createdAt" DESC) WHERE "campaignId" IS NOT NULL;',
    ],
  ])('%s is a single concurrent index statement', (migration, expected) => {
    expect(statement(migration)).toBe(expected);
  });
});
