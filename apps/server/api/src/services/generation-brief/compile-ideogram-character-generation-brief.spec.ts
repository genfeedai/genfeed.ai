import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileIdeogramCharacterGenerationBrief } from '@api/services/generation-brief/compile-ideogram-character-generation-brief';
import { GenerationBriefCompileError } from '@api/services/generation-brief/generation-brief-compile.error';
import { assertRedactedGenerationBriefEvidence } from '@api/services/generation-brief/redact-generation-brief-evidence';
import { imageGenerationBriefSchema } from '@api-types/contracts/generation-brief.contract';
import { ideogramCharacterDispatchSchema } from '@api-types/contracts/generation-brief-compiler.contract';
import { MODEL_KEYS } from '@genfeedai/constants';
import { describe, expect, it } from 'vitest';

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'ideogram-character',
);

function readFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(fixturesDir, name), 'utf8'));
}

const IDEOGRAM_CHARACTER_MODEL_KEY =
  MODEL_KEYS.REPLICATE_IDEOGRAM_AI_IDEOGRAM_CHARACTER;

describe('compileIdeogramCharacterGenerationBrief', () => {
  it('locks the unbranded Ideogram Character mapping and defaults', () => {
    const brief = imageGenerationBriefSchema.parse(
      readFixture('unbranded.input.json'),
    );
    const expectedDispatch = ideogramCharacterDispatchSchema.parse(
      readFixture('unbranded.dispatch.json'),
    );

    const result = compileIdeogramCharacterGenerationBrief({
      brief,
      modelKey: IDEOGRAM_CHARACTER_MODEL_KEY,
    });

    expect(result.dispatch).toEqual(expectedDispatch);
    expect(result.evidence.modelKey).toBe(IDEOGRAM_CHARACTER_MODEL_KEY);
    expect(result.evidence.compilerId).toBe(
      'ideogram-character-image-compiler',
    );
    expect(result.evidence.profileId).toBe('ideogram-character-capability');
    expect(assertRedactedGenerationBriefEvidence(result.evidence)).toEqual(
      result.evidence,
    );
    expect(result.evidence).not.toHaveProperty('prompt');
    expect(result.evidence).not.toHaveProperty('dispatch');
  });

  it('locks the guided Ideogram Character mapping and applies the reference role', () => {
    const brief = imageGenerationBriefSchema.parse(
      readFixture('guided.input.json'),
    );
    const expectedDispatch = ideogramCharacterDispatchSchema.parse(
      readFixture('guided.dispatch.json'),
    );

    const result = compileIdeogramCharacterGenerationBrief({
      brief,
      modelKey: IDEOGRAM_CHARACTER_MODEL_KEY,
    });

    expect(result.dispatch).toEqual(expectedDispatch);
    expect(result.evidence.omittedSignals).toEqual([
      {
        field: 'constraints.avoid',
        reason: 'Ideogram Character has no native negative-prompt field.',
      },
    ]);
    expect(result.evidence.referenceAssetIds).toEqual(['asset_product_123']);
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

    const result = compileIdeogramCharacterGenerationBrief({
      brief,
      modelKey: IDEOGRAM_CHARACTER_MODEL_KEY,
    });

    expect(result.dispatch.prompt).toBe('a sunset over the ocean');
    expect(result.evidence.omittedSignals).toEqual([]);
  });

  it('rejects strict required signals Ideogram Character cannot honor', () => {
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
      compileIdeogramCharacterGenerationBrief({
        brief,
        modelKey: IDEOGRAM_CHARACTER_MODEL_KEY,
      }),
    ).toThrow(GenerationBriefCompileError);
  });

  it('rejects a brief with no reference image regardless of fidelity mode', () => {
    const brief = imageGenerationBriefSchema.parse({
      constraints: [],
      fidelityMode: 'off',
      intent: { objective: 'a sunset over the ocean' },
      mediaKind: 'image',
      output: {},
      references: [],
      version: 1,
    });

    expect(() =>
      compileIdeogramCharacterGenerationBrief({
        brief,
        modelKey: IDEOGRAM_CHARACTER_MODEL_KEY,
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
      references: [{ assetId: 'asset_reference_001', role: 'product' }],
      version: 1,
    });

    expect(() =>
      compileIdeogramCharacterGenerationBrief({
        brief,
        modelKey: 'ideogram-ai/ideogram-character-v9',
      }),
    ).toThrow(GenerationBriefCompileError);
  });

  it('does not mutate the normalized brief', () => {
    const brief = imageGenerationBriefSchema.parse(
      readFixture('unbranded.input.json'),
    );
    const original = structuredClone(brief);

    compileIdeogramCharacterGenerationBrief({
      brief,
      modelKey: IDEOGRAM_CHARACTER_MODEL_KEY,
    });

    expect(brief).toEqual(original);
  });
});
