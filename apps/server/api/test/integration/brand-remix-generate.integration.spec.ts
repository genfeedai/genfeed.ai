import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BRAND_REMIX_DOWNSTREAM_ACTION_IDS,
  buildBrandRemixGenerateWorkflowDefinitions,
} from '@api/collections/content-runs/services/brand-remix-downstream-workflow-definition';
import { getActionDefinition } from '@genfeedai/actions';
import { describe, expect, it } from 'vitest';

const CONTENT_RUNS = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../src/collections/content-runs/services',
);

describe('Brand remix generate workflow integration', () => {
  it('deletes the service-macro generation paths', () => {
    const execution = readFileSync(
      join(CONTENT_RUNS, 'brand-remix-run-execution.service.ts'),
      'utf8',
    );
    const dispatch = readFileSync(
      join(CONTENT_RUNS, 'brand-remix-run-provider-dispatch.service.ts'),
      'utf8',
    );

    expect(execution).not.toContain('generateCopyVariants');
    expect(execution).not.toContain('dispatchMediaVariants');
    expect(execution).not.toContain('finalizeOutputCredits');
    expect(execution).not.toContain('GenerationReservationBarrier');
    expect(dispatch).not.toContain('generateCopyVariants');
    expect(dispatch).not.toContain('persistCopyGenerationResult');
    expect(dispatch).not.toContain('finalizeOutputCredits');
    expect(execution).toContain('brand-remix.generate');
    expect(execution).toContain('SystemWorkflowRunnerService');
  });

  it('registers every generate action and workflow definition', () => {
    const definitions = buildBrandRemixGenerateWorkflowDefinitions();
    expect(
      definitions.map((definition) => definition.canonicalId).sort(),
    ).toEqual(
      [
        'brand-remix.generate',
        'brand-remix.generate.dispatch-one',
        'brand-remix.generate.resolve-credits',
      ].sort(),
    );
    const generateIds = Object.values(BRAND_REMIX_DOWNSTREAM_ACTION_IDS).filter(
      (id) => id.startsWith('brand-remix.generate.'),
    );
    expect(generateIds).toHaveLength(7);
    for (const actionId of generateIds) {
      expect(getActionDefinition(actionId), actionId).toBeDefined();
    }
  });
});
