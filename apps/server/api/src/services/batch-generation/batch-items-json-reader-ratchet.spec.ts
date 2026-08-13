import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Reader ratchet for dropping `Batch.items` JSON in a later PR.
 *
 * Production batch-generation readers must go through `resolveBatchItems`,
 * which prefers typed `batch_items` rows and falls back to the JSON blob.
 * Writers in this PR still persist `Batch.items` so existing rows stay in
 * sync; a follow-up can delete the JSON column once this fallback is unused.
 */
const dir = fileURLToPath(new URL('./', import.meta.url));

const PRODUCTION_FILES = readdirSync(dir).filter(
  (name) =>
    name.endsWith('.ts') &&
    !name.endsWith('.spec.ts') &&
    !name.endsWith('.test.ts') &&
    name !== 'batch-generation.types.ts',
);

describe('batch items JSON reader ratchet', () => {
  it('routes production readers through resolveBatchItems, not cloneBatchItems', () => {
    const offenders: string[] = [];

    for (const name of PRODUCTION_FILES) {
      const source = readFileSync(join(dir, name), 'utf8');
      if (source.includes('cloneBatchItems(')) {
        offenders.push(name);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('still writes Batch.items JSON from the transactional writer', () => {
    const writer = readFileSync(join(dir, 'batch-item-rows.ts'), 'utf8');
    expect(writer).toContain('writeBatchJsonAndItemRows');
    expect(writer).toMatch(/items:\s*input\.items/);
  });
});
