import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileFlux2FlexGenerationBrief } from '@api/services/generation-brief/compile-flux-2-flex-generation-brief';
import { GenerationBriefCompileError } from '@api/services/generation-brief/generation-brief-compile.error';
import { assertRedactedGenerationBriefEvidence } from '@api/services/generation-brief/redact-generation-brief-evidence';
import { imageGenerationBriefSchema } from '@api-types/contracts/generation-brief.contract';
import { flux2FlexDispatchSchema } from '@api-types/contracts/generation-brief-compiler.contract';
import { MODEL_KEYS } from '@genfeedai/constants';
import { describe, expect, it } from 'vitest';

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'flux-2-flex',
);

function readFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(fixturesDir, name), 'utf8'));
}

const FLUX_2_FLEX_MODEL_KEY =
  MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_2_FLEX;

describe('compileFlux2FlexGenerationBrief', () => {
  it('locks the unbranded FLUX 2 Flex mapping and defaults', () => {
    const brief = imageGenerationBriefSchema.parse(
      readFixture('unbranded.input.json'),
    );
    const expectedDispatch = flux2FlexDispatchSchema.parse(
      readFixture('unbranded.dispatch.json'),
    );

    const result = compileFlux2FlexGenerationBrief({
      brief,
      modelKey: FLUX_2_FLEX_MODEL_KEY,
    });

    expect(result.dispatch).toEqual(expectedDispatch);
    expect(result.evidence.modelKey).toBe(FLUX_2_FLEX_MODEL_KEY);
    expect(result.evidence.compilerId).toBe('flux-2-flex-image-compiler');
    expect(result.evidence.profileId).toBe('flux-2-flex-capability');
    expect(assertRedactedGenerationBriefEvidence(result.evidence)).toEqual(
      result.evidence,
    );
    expect(result.evidence).not.toHaveProperty('prompt');
    expect(result.evidence).not.toHaveProperty('dispatch');
  });

  it('locks the guided FLUX 2 Flex mapping and omits the unsupported negative prompt', () => {
    const brief = imageGenerationBriefSchema.parse(
      readFixture('guided.input.json'),
    );
    const expectedDispatch = flux2FlexDispatchSchema.parse(
      readFixture('guided.dispatch.json'),
    );

    const result = compileFlux2FlexGenerationBrief({
      brief,
      modelKey: FLUX_2_FLEX_MODEL_KEY,
      seed: 42,
    });

    expect(result.dispatch).toEqual(expectedDispatch);
    expect(result.dispatch).not.toHaveProperty('negative_prompt');
    expect(result.evidence.omittedSignals).toEqual([
      {
        field: 'constraints.avoid',
        reason: 'FLUX 2 Flex has no native negative-prompt field.',
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
      version: 1,
    });

    const result = compileFlux2FlexGenerationBrief({
      brief,
      modelKey: FLUX_2_FLEX_MODEL_KEY,
    });

    expect(result.dispatch.prompt).toBe('a sunset over the ocean');
    expect(result.evidence.omittedSignals).toEqual([]);
  });

  it('rejects strict required signals FLUX 2 Flex cannot honor', () => {
    const brief = imageGenerationBriefSchema.parse({
      constraints: [
        { kind: 'avoid', required: true, value: 'busy backgrounds' },
      ],
      fidelityMode: 'strict',
      intent: { objective: 'Create a launch image for the new bottle' },
      mediaKind: 'image',
      output: {},
      references: [{ assetId: 'asset_product_123', role: 'product' }],
      version: 1,
    });

    expect(() =>
      compileFlux2FlexGenerationBrief({
        brief,
        modelKey: FLUX_2_FLEX_MODEL_KEY,
      }),
    ).toThrow(GenerationBriefCompileError);
  });

  it('rejects an unregistered model key', () => {
    const brief = imageGenerationBriefSchema.parse({
      constraints: [],
      fidelityMode: 'off',
      intent: { objective: 'a sunset over the ocean' },
      mediaKind: 'image',
      output: {},
      version: 1,
    });

    expect(() =>
      compileFlux2FlexGenerationBrief({
        brief,
        modelKey: 'black-forest-labs/flux-99',
      }),
    ).toThrow(GenerationBriefCompileError);
  });

  it('does not mutate the normalized brief', () => {
    const brief = imageGenerationBriefSchema.parse(
      readFixture('guided.input.json'),
    );
    const original = structuredClone(brief);

    compileFlux2FlexGenerationBrief({
      brief,
      modelKey: FLUX_2_FLEX_MODEL_KEY,
    });

    expect(brief).toEqual(original);
  });
});
