import { compileRemainingImageGenerationBrief } from '@api/services/generation-brief/compile-remaining-image-generation-brief';
import { GenerationBriefCompileError } from '@api/services/generation-brief/generation-brief-compile.error';
import { REMAINING_IMAGE_GENERATION_BRIEF_FAMILIES } from '@api/services/generation-brief/remaining-image-generation-brief-families';
import { imageGenerationBriefSchema } from '@api-types/contracts/generation-brief.contract';
import { GPT_IMAGE_IMAGE_COMPILER_ID } from '@api-types/contracts/generation-brief-compiler.contract';
import { MODEL_KEYS } from '@genfeedai/constants';
import { normalizeAspectRatioForModel } from '@genfeedai/helpers';
import { describe, expect, it } from 'vitest';

function familyFor(modelKey: string) {
  const family = REMAINING_IMAGE_GENERATION_BRIEF_FAMILIES.find((entry) =>
    entry.profiles.some((profile) => profile.modelKey === modelKey),
  );
  if (!family) {
    throw new Error(`No remaining image family for ${modelKey}`);
  }
  return family;
}

describe('compileRemainingImageGenerationBrief', () => {
  it('compiles an unbranded GPT Image request to prompt + aspect_ratio', () => {
    const brief = imageGenerationBriefSchema.parse({
      constraints: [],
      fidelityMode: 'off',
      intent: { objective: 'a sunset over the ocean' },
      mediaKind: 'image',
      output: { aspectRatio: '16:9' },
      version: 1,
    });

    const result = compileRemainingImageGenerationBrief({
      brief,
      family: familyFor(MODEL_KEYS.REPLICATE_OPENAI_GPT_IMAGE_2),
      modelKey: MODEL_KEYS.REPLICATE_OPENAI_GPT_IMAGE_2,
    });

    expect(result.dispatch.prompt).toBe('a sunset over the ocean');
    expect(result.dispatch.aspect_ratio).toBe(
      normalizeAspectRatioForModel(
        MODEL_KEYS.REPLICATE_OPENAI_GPT_IMAGE_2,
        '16:9',
      ),
    );
    expect(result.evidence.compilerId).toBe(GPT_IMAGE_IMAGE_COMPILER_ID);
    expect(result.evidence.omittedSignals).toEqual([]);
  });

  it('maps avoid constraints onto SDXL negative_prompt under guided fidelity', () => {
    const brief = imageGenerationBriefSchema.parse({
      constraints: [
        { kind: 'avoid', required: false, value: 'busy backgrounds' },
      ],
      fidelityMode: 'guided',
      intent: { objective: 'a bottle on marble' },
      mediaKind: 'image',
      output: { aspectRatio: '1:1' },
      version: 1,
    });

    const result = compileRemainingImageGenerationBrief({
      brief,
      family: familyFor(MODEL_KEYS.SDXL),
      modelKey: MODEL_KEYS.SDXL,
    });

    expect(result.dispatch.negative_prompt).toBe('busy backgrounds');
    expect(result.evidence.omittedSignals).toEqual([]);
  });

  it('omits seeds for GPT Image profiles that do not expose a seed field', () => {
    const brief = imageGenerationBriefSchema.parse({
      constraints: [],
      fidelityMode: 'off',
      intent: { objective: 'a sunset over the ocean' },
      mediaKind: 'image',
      output: { aspectRatio: '1:1' },
      version: 1,
    });

    const result = compileRemainingImageGenerationBrief({
      brief,
      family: familyFor(MODEL_KEYS.REPLICATE_OPENAI_GPT_IMAGE_1_5),
      modelKey: MODEL_KEYS.REPLICATE_OPENAI_GPT_IMAGE_1_5,
      seed: 42,
    });

    expect(result.dispatch).not.toHaveProperty('seed');
  });

  it('rejects PuLID compilation when the required identity reference is missing', () => {
    const brief = imageGenerationBriefSchema.parse({
      constraints: [],
      fidelityMode: 'strict',
      intent: { objective: 'a portrait of the brand face' },
      mediaKind: 'image',
      output: {},
      version: 1,
    });

    expect(() =>
      compileRemainingImageGenerationBrief({
        brief,
        family: familyFor(MODEL_KEYS.GENFEED_AI_FLUX2_DEV_PULID),
        modelKey: MODEL_KEYS.GENFEED_AI_FLUX2_DEV_PULID,
      }),
    ).toThrow(GenerationBriefCompileError);
  });

  it('dispatches PuLID identity onto id_image', () => {
    const brief = imageGenerationBriefSchema.parse({
      constraints: [],
      fidelityMode: 'strict',
      intent: { objective: 'a portrait of the brand face' },
      mediaKind: 'image',
      output: { aspectRatio: '1:1' },
      references: [{ assetId: 'face-1', role: 'character' }],
      version: 1,
    });

    const result = compileRemainingImageGenerationBrief({
      brief,
      family: familyFor(MODEL_KEYS.GENFEED_AI_FLUX2_DEV_PULID),
      modelKey: MODEL_KEYS.GENFEED_AI_FLUX2_DEV_PULID,
    });

    expect(result.dispatch.id_image).toBe('face-1');
    expect(result.evidence.referenceAssetIds).toEqual(['face-1']);
  });
});
