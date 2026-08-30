import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const schema = readFileSync(join(prismaDir, 'schema.prisma'), 'utf8');
const migration = readFileSync(
  join(
    prismaDir,
    'migrations/20260812220000_workflow_execution_node_results/migration.sql',
  ),
  'utf8',
);

describe('workflow_execution_node_results (#2512)', () => {
  it('declares unique (executionId, nodeId) in schema and migration', () => {
    expect(schema).toContain('model WorkflowExecutionNodeResult');
    expect(schema).toContain('@@unique([executionId, nodeId])');
    expect(migration).toContain('workflow_execution_node_results');
    expect(migration).toContain(
      'workflow_execution_node_results_executionId_nodeId_key',
    );
  });

  it('promotes progress and ETA onto WorkflowExecution scalars', () => {
    expect(schema).toContain('progress             Int       @default(0)');
    expect(schema).toContain('estimatedDurationMs Int?');
    expect(schema).toContain('remainingDurationMs Int?');
    expect(schema).toContain('etaCurrentPhase     String?');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "progress"');
    expect(migration).toContain(
      'ADD COLUMN IF NOT EXISTS "estimatedDurationMs"',
    );
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS "etaCurrentPhase"');
  });

  it('does not rewrite sibling hot-path tables', () => {
    expect(migration).not.toContain('ad_performances');
    expect(migration).not.toContain('batch_items');
    expect(migration).not.toContain('content_plan_items');
    expect(migration).not.toMatch(/\bposts\b/);
    expect(migration).not.toContain('insights');
  });
});
