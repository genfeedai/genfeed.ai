import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileNanoBanana2GenerationBrief } from '@api/services/generation-brief/compile-nano-banana-2-generation-brief';
import { GenerationBriefCompileError } from '@api/services/generation-brief/generation-brief-compile.error';
import { assertRedactedGenerationBriefEvidence } from '@api/services/generation-brief/redact-generation-brief-evidence';
import { imageGenerationBriefSchema } from '@api-types/contracts/generation-brief.contract';
import { nanoBanana2DispatchSchema } from '@api-types/contracts/generation-brief-compiler.contract';
import { MODEL_KEYS } from '@genfeedai/constants';
import { describe, expect, it } from 'vitest';

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'nano-banana-2',
);

function readFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(fixturesDir, name), 'utf8'));
}

const NANO_BANANA_PRO_MODEL_KEY = MODEL_KEYS.REPLICATE_GOOGLE_NANO_BANANA_PRO;
const NANO_BANANA_2_MODEL_KEY = MODEL_KEYS.REPLICATE_GOOGLE_NANO_BANANA_2;
const NANO_BANANA_2_LITE_MODEL_KEY =
  MODEL_KEYS.REPLICATE_GOOGLE_NANO_BANANA_2_LITE;

describe('compileNanoBanana2GenerationBrief', () => {
  it('locks the unbranded Nano Banana Pro mapping and defaults', () => {
    const brief = imageGenerationBriefSchema.parse(
      readFixture('unbranded.input.json'),
    );
    const expectedDispatch = nanoBanana2DispatchSchema.parse(
      readFixture('unbranded.dispatch.json'),
    );

    const result = compileNanoBanana2GenerationBrief({
      brief,
      modelKey: NANO_BANANA_PRO_MODEL_KEY,
    });

    expect(result.dispatch).toEqual(expectedDispatch);
    expect(result.evidence.modelKey).toBe(NANO_BANANA_PRO_MODEL_KEY);
    expect(result.evidence.compilerId).toBe('nano-banana-2-image-compiler');
    expect(result.evidence.profileId).toBe('nano-banana-pro-capability');
    expect(assertRedactedGenerationBriefEvidence(result.evidence)).toEqual(
      result.evidence,
    );
    expect(result.evidence).not.toHaveProperty('prompt');
    expect(result.evidence).not.toHaveProperty('dispatch');
  });

  it('locks the guided Nano Banana Pro mapping, includes the reference and omits the unsupported negative prompt', () => {
    const brief = imageGenerationBriefSchema.parse(
      readFixture('guided.input.json'),
    );
    const expectedDispatch = nanoBanana2DispatchSchema.parse(
      readFixture('guided.dispatch.json'),
    );

    const result = compileNanoBanana2GenerationBrief({
      brief,
      modelKey: NANO_BANANA_PRO_MODEL_KEY,
    });

    expect(result.dispatch).toEqual(expectedDispatch);
    expect(result.evidence.omittedSignals).toEqual([
      {
        field: 'constraints.avoid',
        reason: 'Nano Banana 2 has no native negative-prompt field.',
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

    const result = compileNanoBanana2GenerationBrief({
      brief,
      modelKey: NANO_BANANA_PRO_MODEL_KEY,
    });

    expect(result.dispatch.prompt).toBe('a sunset over the ocean');
    expect(result.evidence.omittedSignals).toEqual([]);
  });

  it('rejects strict required signals Nano Banana 2 cannot honor', () => {
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
      compileNanoBanana2GenerationBrief({
        brief,
        modelKey: NANO_BANANA_PRO_MODEL_KEY,
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
      compileNanoBanana2GenerationBrief({
        brief,
        modelKey: 'google/nano-banana-9',
      }),
    ).toThrow(GenerationBriefCompileError);
  });

  it('does not mutate the normalized brief', () => {
    const brief = imageGenerationBriefSchema.parse(
      readFixture('unbranded.input.json'),
    );
    const original = structuredClone(brief);

    compileNanoBanana2GenerationBrief({
      brief,
      modelKey: NANO_BANANA_PRO_MODEL_KEY,
    });

    expect(brief).toEqual(original);
  });

  it('compiles Nano Banana 2 and Nano Banana 2 Lite from their own profiles and never sets a dispatch resolution', () => {
    const brief = imageGenerationBriefSchema.parse(
      readFixture('unbranded.input.json'),
    );

    const nanoBanana2Result = compileNanoBanana2GenerationBrief({
      brief,
      modelKey: NANO_BANANA_2_MODEL_KEY,
    });
    const nanoBanana2LiteResult = compileNanoBanana2GenerationBrief({
      brief,
      modelKey: NANO_BANANA_2_LITE_MODEL_KEY,
    });

    expect(nanoBanana2Result.evidence.profileId).toBe(
      'nano-banana-2-capability',
    );
    expect(nanoBanana2LiteResult.evidence.profileId).toBe(
      'nano-banana-2-lite-capability',
    );
    // Nano Banana Pro and Nano Banana 2 both have `resolution: { supported: true }`
    // on their capability profile, but the brief carries no resolution-tier
    // value to map onto it, so the dispatch never sets `resolution`.
    expect(nanoBanana2Result.dispatch).not.toHaveProperty('resolution');
    expect(nanoBanana2LiteResult.dispatch).not.toHaveProperty('resolution');
    // Only Nano Banana Pro has a `safetyFilterLevel` default; the other two
    // siblings must omit the field entirely rather than dispatch `undefined`.
    expect(nanoBanana2Result.dispatch).not.toHaveProperty(
      'safety_filter_level',
    );
    expect(nanoBanana2LiteResult.dispatch).not.toHaveProperty(
      'safety_filter_level',
    );
  });
});
