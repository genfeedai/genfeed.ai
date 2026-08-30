import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const prismaDir = fileURLToPath(new URL('./', import.meta.url));
const schema = readFileSync(join(prismaDir, 'schema.prisma'), 'utf8');
const migration = readFileSync(
  join(
    prismaDir,
    'migrations/20260829120000_drop_agent_runs_link_workflow_executions/migration.sql',
  ),
  'utf8',
);

describe('workflow execution hard cut', () => {
  it('removes the standalone AgentRun persistence model', () => {
    expect(schema).not.toContain('model AgentRun');
    expect(schema).not.toContain('enum AgentRunStatus');
    expect(schema).not.toContain('agentRunId');
    expect(migration).toContain('DROP TABLE "agent_runs"');
    expect(migration).toContain('DROP TYPE "AgentRunStatus"');
  });

  it('links workspace tasks and execution-owned artifacts to WorkflowExecution', () => {
    expect(schema).toContain(
      'linkedExecutions WorkflowExecution[] @relation("task_linked_executions")',
    );
    expect(schema).toContain(
      'workspaceTasks           Task[]                        @relation("task_linked_executions")',
    );
    expect(migration).toContain('CREATE TABLE "_task_linked_executions"');
    expect(migration).toContain('ingredients_workflowExecutionId_fkey');
    expect(migration).toContain('newsletters_workflowExecutionId_fkey');
    expect(migration).toContain('captions_workflowExecutionId_fkey');
    expect(migration).toContain(
      'agent_publish_audits_workflowExecutionId_fkey',
    );
  });
});
