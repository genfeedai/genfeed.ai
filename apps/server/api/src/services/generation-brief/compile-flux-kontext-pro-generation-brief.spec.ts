import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileFluxKontextProGenerationBrief } from '@api/services/generation-brief/compile-flux-kontext-pro-generation-brief';
import { GenerationBriefCompileError } from '@api/services/generation-brief/generation-brief-compile.error';
import { assertRedactedGenerationBriefEvidence } from '@api/services/generation-brief/redact-generation-brief-evidence';
import { imageGenerationBriefSchema } from '@genfeedai/contracts/api-types/contracts/generation-brief.contract';
import { fluxKontextProDispatchSchema } from '@genfeedai/contracts/api-types/contracts/generation-brief-compiler.contract';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { describe, expect, it } from 'vitest';

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'flux-kontext-pro',
);

function readFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(fixturesDir, name), 'utf8'));
}

const FLUX_KONTEXT_PRO_MODEL_KEY =
  MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_KONTEXT_PRO;
const FLUX_KONTEXT_MAX_MODEL_KEY =
  MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_KONTEXT_MAX;

describe('compileFluxKontextProGenerationBrief', () => {
  it('locks the unbranded FLUX Kontext Pro mapping and defaults', () => {
    const brief = imageGenerationBriefSchema.parse(
      readFixture('unbranded.input.json'),
    );
    const expectedDispatch = fluxKontextProDispatchSchema.parse(
      readFixture('unbranded.dispatch.json'),
    );

    const result = compileFluxKontextProGenerationBrief({
      brief,
      modelKey: FLUX_KONTEXT_PRO_MODEL_KEY,
    });

    expect(result.dispatch).toEqual(expectedDispatch);
    expect(result.evidence.modelKey).toBe(FLUX_KONTEXT_PRO_MODEL_KEY);
    expect(result.evidence.compilerId).toBe('flux-kontext-pro-image-compiler');
    expect(result.evidence.profileId).toBe('flux-kontext-pro-capability');
    expect(assertRedactedGenerationBriefEvidence(result.evidence)).toEqual(
      result.evidence,
    );
    expect(result.evidence).not.toHaveProperty('prompt');
    expect(result.evidence).not.toHaveProperty('dispatch');
  });

  it('locks the guided FLUX Kontext Max mapping under the shared dispatch shape', () => {
    const brief = imageGenerationBriefSchema.parse(
      readFixture('guided.input.json'),
    );
    const expectedDispatch = fluxKontextProDispatchSchema.parse(
      readFixture('guided.dispatch.json'),
    );

    const result = compileFluxKontextProGenerationBrief({
      brief,
      modelKey: FLUX_KONTEXT_MAX_MODEL_KEY,
      seed: 42,
    });

    expect(result.dispatch).toEqual(expectedDispatch);
    expect(result.dispatch).not.toHaveProperty('negative_prompt');
    expect(result.evidence.modelKey).toBe(FLUX_KONTEXT_MAX_MODEL_KEY);
    expect(result.evidence.profileId).toBe('flux-kontext-max-capability');
    expect(result.evidence.omittedSignals).toEqual([
      {
        field: 'constraints.avoid',
        reason: 'FLUX Kontext Pro has no native negative-prompt field.',
      },
    ]);
    expect(result.evidence.referenceAssetIds).toEqual(['asset_product_123']);
    expect(result.evidence.output.hasSeed).toBe(true);
    expect(JSON.stringify(result.evidence)).not.toContain(
      'Approved product packshot',
    );
    expect(assertRedactedGenerationBriefEvidence(result.evidence)).toEqual(
      result.evidence,
    );
  });

  it('ignores avoid constraints when fidelity is off', () => {
    const brief = imageGenerationBriefSchema.parse({
      constraints: [
        { kind: 'avoid', required: false, value: 'busy backgrounds' },
      ],
      fidelityMode: 'off',
      intent: { objective: 'a sunset over the ocean' },
      mediaKind: 'image',
      output: { aspectRatio: '16:9' },
      references: [{ assetId: 'asset_reference_001', role: 'product' }],
      version: 1,
    });

    const result = compileFluxKontextProGenerationBrief({
      brief,
      modelKey: FLUX_KONTEXT_PRO_MODEL_KEY,
    });

    expect(result.dispatch.prompt).toBe('a sunset over the ocean');
    expect(result.evidence.omittedSignals).toEqual([]);
  });

  it('rejects an unregistered model key', () => {
    const brief = imageGenerationBriefSchema.parse({
      constraints: [],
      fidelityMode: 'off',
      intent: { objective: 'a sunset over the ocean' },
      mediaKind: 'image',
      output: {},
      references: [{ assetId: 'asset_reference_001', role: 'product' }],
      version: 1,
    });

    expect(() =>
      compileFluxKontextProGenerationBrief({
        brief,
        modelKey: 'black-forest-labs/flux-kontext-99',
      }),
    ).toThrow(GenerationBriefCompileError);
  });
});
