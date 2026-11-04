import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function statement(migration: string): string {
  return readFileSync(
    new URL(`./migrations/${migration}/migration.sql`, import.meta.url),
    'utf8',
  )
    .split('\n')
    .filter((line) => !line.startsWith('--'))
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/\( /g, '(')
    .replace(/ \)/g, ')')
    .trim();
}

describe('workflow execution cleanup sweep partial indexes', () => {
  it('indexes scrubbed executions by completion time, concurrently', () => {
    expect(
      statement('20261104160000_workflow_execution_scrubbed_cleanup_index'),
    ).toBe(
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS "workflow_executions_scrubbed_cleanup_idx" ON "workflow_executions" ("completedAt") WHERE "payloadScrubbedAt" IS NOT NULL AND "isDeleted" = false;',
    );
  });

  it('indexes unscrubbed executions that carry a retention policy, concurrently', () => {
    expect(
      statement('20261104160100_workflow_execution_retention_pending_index'),
    ).toBe(
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS "workflow_executions_retention_pending_idx" ON "workflow_executions" ("completedAt") WHERE "payloadScrubbedAt" IS NULL AND "isDeleted" = false AND ("purgeAfterHours" IS NOT NULL OR "scrubAllNodePayloads" = true OR "scrubNodeIds" <> \'{}\');',
    );
  });
});
