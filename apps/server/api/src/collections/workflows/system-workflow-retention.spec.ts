import { readFileSync } from 'node:fs';
import {
  SystemWorkflowRetention,
  WORKFLOW_RUN_RETENTION_METADATA_KEY,
} from '@api/collections/workflows/workflow-execution-retention.contract';
import { collectSystemWorkflowDefinitions } from '@api/shared/testing/system-workflow-definition-discovery';
import { describe, expect, it } from 'vitest';

const backfill = readFileSync(
  new URL(
    '../../../../../../packages/prisma/prisma/migrations/20261116100500_backfill_workflow_execution_purge_at/migration.sql',
    import.meta.url,
  ),
  'utf8',
);

function sqlList(pattern: RegExp): string[] {
  const body = backfill.match(pattern)?.[1];
  if (!body) {
    throw new Error('The purgeAt backfill migration lost a kept id list');
  }
  return [...body.matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

const KEPT_IDS = sqlList(/= ANY \(ARRAY\[([^\]]+)\]/);
const KEPT_PREFIXES = sqlList(/LIKE ANY \(ARRAY\[([^\]]+)\]/).map((pattern) =>
  pattern.replace(/%$/, ''),
);

function isKeptBySql(canonicalId: string): boolean {
  return (
    KEPT_IDS.includes(canonicalId) ||
    KEPT_PREFIXES.some((prefix) => canonicalId.startsWith(prefix))
  );
}

/**
 * Every system workflow decides how long its run history is kept (#10382).
 * Background runs are deleted in bulk a day after success; a new workflow that
 * forgot the decision would fill the database again.
 */
describe('system workflow run retention', () => {
  it('names a retention for every system workflow definition', async () => {
    const definitions = await collectSystemWorkflowDefinitions();

    const undecided = definitions
      .filter(
        (definition) =>
          !Object.values(SystemWorkflowRetention).includes(
            definition.retention,
          ),
      )
      .map((definition) => definition.canonicalId);

    expect(definitions.length).toBeGreaterThan(100);
    expect(undecided).toEqual([]);
  });

  it('keeps the purgeAt backfill kept ids in step with the definitions', async () => {
    const definitions = await collectSystemWorkflowDefinitions();

    const mismatched = definitions
      .filter(
        (definition) =>
          isKeptBySql(definition.canonicalId) !==
          (definition.retention === SystemWorkflowRetention.KEPT),
      )
      .map(
        (definition) => `${definition.canonicalId}: ${definition.retention}`,
      );

    expect(mismatched).toEqual([]);
  });

  it('records the run retention under a stable metadata key', () => {
    expect(WORKFLOW_RUN_RETENTION_METADATA_KEY).toBe('runRetention');
  });
});
