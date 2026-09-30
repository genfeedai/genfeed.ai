import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileQwenImageGenerationBrief } from '@api/services/generation-brief/compile-qwen-image-generation-brief';
import { GenerationBriefCompileError } from '@api/services/generation-brief/generation-brief-compile.error';
import { assertRedactedGenerationBriefEvidence } from '@api/services/generation-brief/redact-generation-brief-evidence';
import { imageGenerationBriefSchema } from '@genfeedai/contracts/api-types/contracts/generation-brief.contract';
import { qwenImageDispatchSchema } from '@genfeedai/contracts/api-types/contracts/generation-brief-compiler.contract';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { describe, expect, it } from 'vitest';

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  'fixtures',
  'qwen-image',
);

function readFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(fixturesDir, name), 'utf8'));
}

const QWEN_IMAGE_MODEL_KEY = MODEL_KEYS.REPLICATE_QWEN_QWEN_IMAGE;

describe('compileQwenImageGenerationBrief', () => {
  it('locks the unbranded Qwen Image mapping and defaults', () => {
    const brief = imageGenerationBriefSchema.parse(
      readFixture('unbranded.input.json'),
    );
    const expectedDispatch = qwenImageDispatchSchema.parse(
      readFixture('unbranded.dispatch.json'),
    );

    const result = compileQwenImageGenerationBrief({
      brief,
      modelKey: QWEN_IMAGE_MODEL_KEY,
    });

    expect(result.dispatch).toEqual(expectedDispatch);
    expect(result.dispatch).not.toHaveProperty('negative_prompt');
    expect(result.dispatch).not.toHaveProperty('image');
    expect(result.evidence.modelKey).toBe(QWEN_IMAGE_MODEL_KEY);
    expect(result.evidence.compilerId).toBe('qwen-image-image-compiler');
    expect(result.evidence.profileId).toBe('qwen-image-capability');
    expect(assertRedactedGenerationBriefEvidence(result.evidence)).toEqual(
      result.evidence,
    );
    expect(result.evidence).not.toHaveProperty('prompt');
    expect(result.evidence).not.toHaveProperty('dispatch');
  });

  it('locks the guided Qwen Image mapping and routes avoid onto the native negative prompt', () => {
    const brief = imageGenerationBriefSchema.parse(
      readFixture('guided.input.json'),
    );
    const expectedDispatch = qwenImageDispatchSchema.parse(
      readFixture('guided.dispatch.json'),
    );

    const result = compileQwenImageGenerationBrief({
      brief,
      modelKey: QWEN_IMAGE_MODEL_KEY,
      seed: 42,
    });

    expect(result.dispatch).toEqual(expectedDispatch);
    expect(result.dispatch.negative_prompt).toBe('busy backgrounds');
    expect(result.dispatch.prompt).not.toContain('busy backgrounds');
    expect(result.evidence.omittedSignals).toEqual([]);
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

    const result = compileQwenImageGenerationBrief({
      brief,
      modelKey: QWEN_IMAGE_MODEL_KEY,
    });

    expect(result.dispatch.prompt).toBe('a sunset over the ocean');
    expect(result.dispatch).not.toHaveProperty('negative_prompt');
    expect(result.evidence.omittedSignals).toEqual([]);
  });

  it('caps references at one and records the excess reference', () => {
    const brief = imageGenerationBriefSchema.parse({
      constraints: [],
      fidelityMode: 'guided',
      intent: { objective: 'Create a launch image for the new bottle' },
      mediaKind: 'image',
      output: {},
      references: [
        { assetId: 'asset_product_123', role: 'product' },
        { assetId: 'asset_product_124', role: 'product' },
      ],
      version: 1,
    });

    const result = compileQwenImageGenerationBrief({
      brief,
      modelKey: QWEN_IMAGE_MODEL_KEY,
    });

    expect(result.dispatch.image).toBe('asset_product_123');
    expect(result.evidence.referenceAssetIds).toEqual(['asset_product_123']);
    expect(result.evidence.omittedSignals).toEqual([
      {
        field: 'references',
        reason:
          'Qwen Image accepts at most 1 reference image(s); 1 extra reference(s) were omitted.',
      },
    ]);
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
      compileQwenImageGenerationBrief({
        brief,
        modelKey: 'qwen/qwen-image-99',
      }),
    ).toThrow(GenerationBriefCompileError);
  });

  it('does not mutate the normalized brief', () => {
    const brief = imageGenerationBriefSchema.parse(
      readFixture('guided.input.json'),
    );
    const original = structuredClone(brief);

    compileQwenImageGenerationBrief({
      brief,
      modelKey: QWEN_IMAGE_MODEL_KEY,
    });

    expect(brief).toEqual(original);
  });
});
