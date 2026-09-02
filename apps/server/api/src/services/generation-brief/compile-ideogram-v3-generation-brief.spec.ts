import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileIdeogramV3GenerationBrief } from '@api/services/generation-brief/compile-ideogram-v3-generation-brief';
import { GenerationBriefCompileError } from '@api/services/generation-brief/generation-brief-compile.error';
import { assertRedactedGenerationBriefEvidence } from '@api/services/generation-brief/redact-generation-brief-evidence';
import { imageGenerationBriefSchema } from '@api-types/contracts/generation-brief.contract';
import { ideogramV3DispatchSchema } from '@api-types/contracts/generation-brief-compiler.contract';
import { MODEL_KEYS } from '@genfeedai/constants';
import { describe, expect, it } from 'vitest';

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'ideogram-v3',
);

function readFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(fixturesDir, name), 'utf8'));
}

const IDEOGRAM_V3_BALANCED_MODEL_KEY =
  MODEL_KEYS.REPLICATE_IDEOGRAM_AI_IDEOGRAM_V3_BALANCED;
const IDEOGRAM_V3_QUALITY_MODEL_KEY =
  MODEL_KEYS.REPLICATE_IDEOGRAM_AI_IDEOGRAM_V3_QUALITY;
const IDEOGRAM_V3_TURBO_MODEL_KEY =
  MODEL_KEYS.REPLICATE_IDEOGRAM_AI_IDEOGRAM_V3_TURBO;

describe('compileIdeogramV3GenerationBrief', () => {
  it('locks the unbranded Ideogram V3 mapping and defaults', () => {
    const brief = imageGenerationBriefSchema.parse(
      readFixture('unbranded.input.json'),
    );
    const expectedDispatch = ideogramV3DispatchSchema.parse(
      readFixture('unbranded.dispatch.json'),
    );

    const result = compileIdeogramV3GenerationBrief({
      brief,
      modelKey: IDEOGRAM_V3_BALANCED_MODEL_KEY,
    });

    expect(result.dispatch).toEqual(expectedDispatch);
    expect(result.dispatch).not.toHaveProperty('image');
    expect(result.evidence.modelKey).toBe(IDEOGRAM_V3_BALANCED_MODEL_KEY);
    expect(result.evidence.compilerId).toBe('ideogram-v3-image-compiler');
    expect(result.evidence.profileId).toBe('ideogram-v3-balanced-capability');
    expect(assertRedactedGenerationBriefEvidence(result.evidence)).toEqual(
      result.evidence,
    );
  });

  it('locks the guided Ideogram V3 mapping and includes the reference', () => {
    const brief = imageGenerationBriefSchema.parse(
      readFixture('guided.input.json'),
    );
    const expectedDispatch = ideogramV3DispatchSchema.parse(
      readFixture('guided.dispatch.json'),
    );

    const result = compileIdeogramV3GenerationBrief({
      brief,
      modelKey: IDEOGRAM_V3_BALANCED_MODEL_KEY,
    });

    expect(result.dispatch).toEqual(expectedDispatch);
    expect(result.evidence.omittedSignals).toEqual([
      {
        field: 'constraints.avoid',
        reason: 'Ideogram V3 has no native negative-prompt field.',
      },
    ]);
    expect(result.evidence.referenceAssetIds).toEqual(['asset_product_123']);
    expect(assertRedactedGenerationBriefEvidence(result.evidence)).toEqual(
      result.evidence,
    );
  });

  it('compiles the Quality and Turbo tiers with their own profile identity', () => {
    const brief = imageGenerationBriefSchema.parse(
      readFixture('unbranded.input.json'),
    );

    const qualityResult = compileIdeogramV3GenerationBrief({
      brief,
      modelKey: IDEOGRAM_V3_QUALITY_MODEL_KEY,
    });
    const turboResult = compileIdeogramV3GenerationBrief({
      brief,
      modelKey: IDEOGRAM_V3_TURBO_MODEL_KEY,
    });

    expect(qualityResult.evidence.profileId).toBe(
      'ideogram-v3-quality-capability',
    );
    expect(turboResult.evidence.profileId).toBe('ideogram-v3-turbo-capability');
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

    const result = compileIdeogramV3GenerationBrief({
      brief,
      modelKey: IDEOGRAM_V3_BALANCED_MODEL_KEY,
    });

    expect(result.dispatch.prompt).toBe('a sunset over the ocean');
    expect(result.evidence.omittedSignals).toEqual([]);
  });

  it('rejects strict required signals Ideogram V3 cannot honor', () => {
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
      compileIdeogramV3GenerationBrief({
        brief,
        modelKey: IDEOGRAM_V3_BALANCED_MODEL_KEY,
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
      compileIdeogramV3GenerationBrief({
        brief,
        modelKey: 'ideogram-ai/ideogram-v3-extreme',
      }),
    ).toThrow(GenerationBriefCompileError);
  });

  it('does not mutate the normalized brief', () => {
    const brief = imageGenerationBriefSchema.parse(
      readFixture('unbranded.input.json'),
    );
    const original = structuredClone(brief);

    compileIdeogramV3GenerationBrief({
      brief,
      modelKey: IDEOGRAM_V3_BALANCED_MODEL_KEY,
    });

    expect(brief).toEqual(original);
  });
});
