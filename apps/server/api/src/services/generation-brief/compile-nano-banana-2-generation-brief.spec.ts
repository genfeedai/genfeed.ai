import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileNanoBanana2GenerationBrief } from '@api/services/generation-brief/compile-nano-banana-2-generation-brief';
import { GenerationBriefCompileError } from '@api/services/generation-brief/generation-brief-compile.error';
import { assertRedactedGenerationBriefEvidence } from '@api/services/generation-brief/redact-generation-brief-evidence';
import { imageGenerationBriefSchema } from '@genfeedai/contracts/api-types/contracts/generation-brief.contract';
import { nanoBanana2DispatchSchema } from '@genfeedai/contracts/api-types/contracts/generation-brief-compiler.contract';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { REVIEWED_RATE_SHEET_ENTRIES } from '@genfeedai/pricing';
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
const NANO_BANANA_2_1_MODEL_KEY = MODEL_KEYS.REPLICATE_GOOGLE_NANO_BANANA_2_1;
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

  it('names a style and a product reference by position, product first, and keeps ids out of the prompt', () => {
    const base = imageGenerationBriefSchema.parse(
      readFixture('unbranded.input.json'),
    );
    const brief = imageGenerationBriefSchema.parse({
      ...base,
      references: [
        { assetId: 'asset_style_1', role: 'style' },
        { assetId: 'asset_product_1', role: 'product' },
      ],
    });

    const result = compileNanoBanana2GenerationBrief({
      brief,
      modelKey: NANO_BANANA_PRO_MODEL_KEY,
    });

    expect(result.dispatch.image_input).toEqual([
      'asset_product_1',
      'asset_style_1',
    ]);
    expect(result.dispatch.prompt).toContain(
      'Image 1 is the product: keep it exactly. Image 2 is a style reference: match its palette, texture and lighting, not its subject',
    );
    expect(result.dispatch.prompt).not.toContain('asset_');
    expect(result.evidence.appliedFields).toContain('references.roles');
    expect(result.evidence.compilerVersion).toBe(2);
  });

  it('lets a product reference take the last slot ahead of a style reference', () => {
    const base = imageGenerationBriefSchema.parse(
      readFixture('unbranded.input.json'),
    );
    const styles = Array.from({ length: 14 }, (_, index) => ({
      assetId: `asset_style_${index}`,
      role: 'style' as const,
    }));
    const brief = imageGenerationBriefSchema.parse({
      ...base,
      references: [...styles, { assetId: 'asset_product_1', role: 'product' }],
    });

    const result = compileNanoBanana2GenerationBrief({
      brief,
      modelKey: NANO_BANANA_PRO_MODEL_KEY,
    });

    expect(result.dispatch.image_input).toHaveLength(14);
    expect(result.dispatch.image_input?.[0]).toBe('asset_product_1');
    expect(result.dispatch.image_input).not.toContain('asset_style_13');
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

  it('compiles Nano Banana 2, 2.1, and 2 Lite from their own profiles and dispatches the default resolution tier of the ones that have one', () => {
    const brief = imageGenerationBriefSchema.parse(
      readFixture('unbranded.input.json'),
    );

    const nanoBanana2Result = compileNanoBanana2GenerationBrief({
      brief,
      modelKey: NANO_BANANA_2_MODEL_KEY,
    });
    const nanoBanana21Result = compileNanoBanana2GenerationBrief({
      brief,
      modelKey: NANO_BANANA_2_1_MODEL_KEY,
    });
    const nanoBanana2LiteResult = compileNanoBanana2GenerationBrief({
      brief,
      modelKey: NANO_BANANA_2_LITE_MODEL_KEY,
    });

    expect(nanoBanana2Result.evidence.profileId).toBe(
      'nano-banana-2-capability',
    );
    expect(nanoBanana21Result.evidence.profileId).toBe(
      'nano-banana-2-1-capability',
    );
    expect(nanoBanana2LiteResult.evidence.profileId).toBe(
      'nano-banana-2-lite-capability',
    );
    // The brief carries no resolution-tier value, so a model whose profile
    // supports resolution dispatches Replicate's default tier, the one its
    // reviewed rates price. Lite has no resolution input.
    expect(nanoBanana2Result.dispatch.resolution).toBe('1K');
    expect(nanoBanana21Result.dispatch.resolution).toBe('1K');
    expect(nanoBanana2LiteResult.dispatch).not.toHaveProperty('resolution');
    // Only Nano Banana Pro has a `safetyFilterLevel` default; the other
    // siblings must omit the field entirely rather than dispatch `undefined`.
    expect(nanoBanana2Result.dispatch).not.toHaveProperty(
      'safety_filter_level',
    );
    expect(nanoBanana21Result.dispatch).not.toHaveProperty(
      'safety_filter_level',
    );
    expect(nanoBanana2LiteResult.dispatch).not.toHaveProperty(
      'safety_filter_level',
    );
  });

  // API-GENFEED-AI-BE: the compiled dispatch is what admission quotes. With no
  // resolution on it, no reviewed per-tier rate matched and onboarding images
  // failed with "Unpriced or ambiguous variant: output".
  it.each(
    REVIEWED_RATE_SHEET_ENTRIES.filter(
      (entry) =>
        entry.provider === 'replicate' &&
        entry.endpoint.startsWith('google/nano-banana') &&
        entry.rates.some((rate) => 'resolution' in rate.when),
    ).map((entry) => [
      entry.endpoint,
      entry.rates.map((rate) => rate.when.resolution),
    ]),
  )(
    'dispatches %s at a resolution its reviewed rates price',
    (modelKey, tiers) => {
      const brief = imageGenerationBriefSchema.parse(
        readFixture('unbranded.input.json'),
      );

      const { dispatch } = compileNanoBanana2GenerationBrief({
        brief,
        modelKey: String(modelKey),
      });

      expect(tiers).toContain(dispatch.resolution);
    },
  );
});
