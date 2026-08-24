import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileSeedream45GenerationBrief } from '@api/services/generation-brief/compile-seedream-4-5-generation-brief';
import { GenerationBriefCompileError } from '@api/services/generation-brief/generation-brief-compile.error';
import { assertRedactedGenerationBriefEvidence } from '@api/services/generation-brief/redact-generation-brief-evidence';
import { imageGenerationBriefSchema } from '@api-types/contracts/generation-brief.contract';
import { seedream45DispatchSchema } from '@api-types/contracts/generation-brief-compiler.contract';
import { MODEL_KEYS } from '@genfeedai/constants';
import { describe, expect, it } from 'vitest';

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'seedream-4-5',
);

function readFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(fixturesDir, name), 'utf8'));
}

const SEEDREAM_4_5_MODEL_KEY = MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDREAM_4_5;
const SEEDREAM_5_LITE_MODEL_KEY =
  MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDREAM_5_LITE;

describe('compileSeedream45GenerationBrief', () => {
  it('locks the unbranded SeeDream 4.5 mapping and defaults', () => {
    const brief = imageGenerationBriefSchema.parse(
      readFixture('unbranded.input.json'),
    );
    const expectedDispatch = seedream45DispatchSchema.parse(
      readFixture('unbranded.dispatch.json'),
    );

    const result = compileSeedream45GenerationBrief({
      brief,
      modelKey: SEEDREAM_4_5_MODEL_KEY,
    });

    expect(result.dispatch).toEqual(expectedDispatch);
    expect(result.evidence.modelKey).toBe(SEEDREAM_4_5_MODEL_KEY);
    expect(result.evidence.compilerId).toBe('seedream-4-5-image-compiler');
    expect(result.evidence.profileId).toBe('seedream-4-5-capability');
    expect(assertRedactedGenerationBriefEvidence(result.evidence)).toEqual(
      result.evidence,
    );
    expect(result.evidence).not.toHaveProperty('prompt');
    expect(result.evidence).not.toHaveProperty('dispatch');
  });

  it('locks the guided SeeDream 4.5 mapping, includes the reference and omits the unsupported negative prompt', () => {
    const brief = imageGenerationBriefSchema.parse(
      readFixture('guided.input.json'),
    );
    const expectedDispatch = seedream45DispatchSchema.parse(
      readFixture('guided.dispatch.json'),
    );

    const result = compileSeedream45GenerationBrief({
      brief,
      modelKey: SEEDREAM_4_5_MODEL_KEY,
    });

    expect(result.dispatch).toEqual(expectedDispatch);
    expect(result.evidence.omittedSignals).toEqual([
      {
        field: 'constraints.avoid',
        reason: 'SeeDream 4.5 has no native negative-prompt field.',
      },
    ]);
    expect(result.evidence.referenceAssetIds).toEqual(['asset_product_123']);
    expect(result.evidence.output.hasSeed).toBe(false);
    expect(JSON.stringify(result.evidence)).not.toContain(
      'Approved product packshot',
    );
    expect(assertRedactedGenerationBriefEvidence(result.evidence)).toEqual(
      result.evidence,
    );
  });

  it('compiles SeeDream 5 Lite from its own profile and never sets a dispatch aspect ratio', () => {
    const brief = imageGenerationBriefSchema.parse(
      readFixture('unbranded.input.json'),
    );

    const result = compileSeedream45GenerationBrief({
      brief,
      modelKey: SEEDREAM_5_LITE_MODEL_KEY,
    });

    expect(result.dispatch).not.toHaveProperty('aspect_ratio');
    expect(result.dispatch).not.toHaveProperty('output_format');
    expect(result.evidence.profileId).toBe('seedream-5-lite-capability');
    expect(result.evidence.output.aspectRatio).toBe('16:9');
    expect(result.evidence.output.outputFormat).toBe('png');
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

    const result = compileSeedream45GenerationBrief({
      brief,
      modelKey: SEEDREAM_4_5_MODEL_KEY,
    });

    expect(result.dispatch.prompt).toBe('a sunset over the ocean');
    expect(result.evidence.omittedSignals).toEqual([]);
  });

  it('rejects strict required signals SeeDream 4.5 cannot honor', () => {
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
      compileSeedream45GenerationBrief({
        brief,
        modelKey: SEEDREAM_4_5_MODEL_KEY,
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
      compileSeedream45GenerationBrief({
        brief,
        modelKey: 'bytedance/seedream-9',
      }),
    ).toThrow(GenerationBriefCompileError);
  });

  it('does not mutate the normalized brief', () => {
    const brief = imageGenerationBriefSchema.parse(
      readFixture('unbranded.input.json'),
    );
    const original = structuredClone(brief);

    compileSeedream45GenerationBrief({
      brief,
      modelKey: SEEDREAM_4_5_MODEL_KEY,
    });

    expect(brief).toEqual(original);
  });
});
