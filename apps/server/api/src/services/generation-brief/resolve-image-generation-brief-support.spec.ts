import { REMAINING_IMAGE_GENERATION_BRIEF_FAMILIES } from '@api/services/generation-brief/remaining-image-generation-brief-families';
import { resolveImageGenerationBriefSupport } from '@api/services/generation-brief/resolve-image-generation-brief-support';
import { ModelCategory } from '@genfeedai/contracts';
import type { GenerationBriefExemptionReason } from '@genfeedai/contracts/api-types/contracts/generation-brief-compiler.contract';
import {
  FLUX_1_1_PRO_IMAGE_COMPILER_ID,
  FLUX_1_1_PRO_IMAGE_COMPILER_VERSION,
  FLUX_2_DEV_IMAGE_COMPILER_ID,
  FLUX_2_DEV_IMAGE_COMPILER_VERSION,
  FLUX_2_FLEX_IMAGE_COMPILER_ID,
  FLUX_2_FLEX_IMAGE_COMPILER_VERSION,
  FLUX_2_PRO_IMAGE_COMPILER_ID,
  FLUX_2_PRO_IMAGE_COMPILER_VERSION,
  FLUX_KONTEXT_PRO_IMAGE_COMPILER_ID,
  FLUX_KONTEXT_PRO_IMAGE_COMPILER_VERSION,
  FLUX_SCHNELL_IMAGE_COMPILER_ID,
  FLUX_SCHNELL_IMAGE_COMPILER_VERSION,
  IDEOGRAM_CHARACTER_IMAGE_COMPILER_ID,
  IDEOGRAM_CHARACTER_IMAGE_COMPILER_VERSION,
  IDEOGRAM_V3_IMAGE_COMPILER_ID,
  IDEOGRAM_V3_IMAGE_COMPILER_VERSION,
  IMAGEN_IMAGE_COMPILER_ID,
  IMAGEN_IMAGE_COMPILER_VERSION,
  NANO_BANANA_2_IMAGE_COMPILER_ID,
  NANO_BANANA_2_IMAGE_COMPILER_VERSION,
  NANO_BANANA_IMAGE_COMPILER_ID,
  NANO_BANANA_IMAGE_COMPILER_VERSION,
  QWEN_IMAGE_IMAGE_COMPILER_ID,
  QWEN_IMAGE_IMAGE_COMPILER_VERSION,
  RUNWAY_GEN4_IMAGE_TURBO_IMAGE_COMPILER_ID,
  RUNWAY_GEN4_IMAGE_TURBO_IMAGE_COMPILER_VERSION,
  SEEDREAM_4_5_IMAGE_COMPILER_ID,
  SEEDREAM_4_5_IMAGE_COMPILER_VERSION,
  SEEDREAM_4_IMAGE_COMPILER_ID,
  SEEDREAM_4_IMAGE_COMPILER_VERSION,
  SEEDREAM_5_PRO_IMAGE_COMPILER_ID,
  SEEDREAM_5_PRO_IMAGE_COMPILER_VERSION,
} from '@genfeedai/contracts/api-types/contracts/generation-brief-compiler.contract';
import {
  FLUX_1_1_PRO_CAPABILITY_PROFILE_ID,
  FLUX_1_1_PRO_CAPABILITY_PROFILE_VERSION,
  FLUX_1_1_PRO_MODEL_KEY,
  FLUX_2_DEV_CAPABILITY_PROFILE_ID,
  FLUX_2_DEV_CAPABILITY_PROFILE_VERSION,
  FLUX_2_DEV_MODEL_KEY,
  FLUX_2_FLEX_CAPABILITY_PROFILE_ID,
  FLUX_2_FLEX_CAPABILITY_PROFILE_VERSION,
  FLUX_2_FLEX_MODEL_KEY,
  FLUX_2_MAX_CAPABILITY_PROFILE_ID,
  FLUX_2_MAX_MODEL_KEY,
  FLUX_2_PRO_CAPABILITY_PROFILE_ID,
  FLUX_2_PRO_CAPABILITY_PROFILE_VERSION,
  FLUX_2_PRO_MODEL_KEY,
  FLUX_KONTEXT_MAX_CAPABILITY_PROFILE_ID,
  FLUX_KONTEXT_MAX_MODEL_KEY,
  FLUX_KONTEXT_PRO_CAPABILITY_PROFILE_ID,
  FLUX_KONTEXT_PRO_CAPABILITY_PROFILE_VERSION,
  FLUX_KONTEXT_PRO_MODEL_KEY,
  FLUX_SCHNELL_CAPABILITY_PROFILE_ID,
  FLUX_SCHNELL_CAPABILITY_PROFILE_VERSION,
  FLUX_SCHNELL_MODEL_KEY,
  IDEOGRAM_CAPABILITY_PROFILE_VERSION,
  IDEOGRAM_CHARACTER_CAPABILITY_PROFILE_ID,
  IDEOGRAM_CHARACTER_MODEL_KEY,
  IDEOGRAM_V3_BALANCED_CAPABILITY_PROFILE_ID,
  IDEOGRAM_V3_BALANCED_MODEL_KEY,
  IDEOGRAM_V3_CAPABILITY_PROFILE_VERSION,
  IDEOGRAM_V3_QUALITY_CAPABILITY_PROFILE_ID,
  IDEOGRAM_V3_QUALITY_MODEL_KEY,
  IDEOGRAM_V3_TURBO_CAPABILITY_PROFILE_ID,
  IDEOGRAM_V3_TURBO_MODEL_KEY,
  IMAGEN_3_CAPABILITY_PROFILE_ID,
  IMAGEN_3_FAST_CAPABILITY_PROFILE_ID,
  IMAGEN_3_FAST_MODEL_KEY,
  IMAGEN_3_MODEL_KEY,
  IMAGEN_4_CAPABILITY_PROFILE_ID,
  IMAGEN_4_FAST_CAPABILITY_PROFILE_ID,
  IMAGEN_4_FAST_MODEL_KEY,
  IMAGEN_4_MODEL_KEY,
  IMAGEN_4_ULTRA_CAPABILITY_PROFILE_ID,
  IMAGEN_4_ULTRA_MODEL_KEY,
  IMAGEN_CAPABILITY_PROFILE_VERSION,
  NANO_BANANA_2_CAPABILITY_PROFILE_ID,
  NANO_BANANA_2_CAPABILITY_PROFILE_VERSION,
  NANO_BANANA_2_LITE_CAPABILITY_PROFILE_ID,
  NANO_BANANA_2_LITE_MODEL_KEY,
  NANO_BANANA_2_MODEL_KEY,
  NANO_BANANA_CAPABILITY_PROFILE_ID,
  NANO_BANANA_CAPABILITY_PROFILE_VERSION,
  NANO_BANANA_MODEL_KEY,
  NANO_BANANA_PRO_CAPABILITY_PROFILE_ID,
  NANO_BANANA_PRO_MODEL_KEY,
  QWEN_IMAGE_CAPABILITY_PROFILE_ID,
  QWEN_IMAGE_CAPABILITY_PROFILE_VERSION,
  QWEN_IMAGE_MODEL_KEY,
  RUNWAY_GEN4_IMAGE_TURBO_CAPABILITY_PROFILE_ID,
  RUNWAY_GEN4_IMAGE_TURBO_CAPABILITY_PROFILE_VERSION,
  RUNWAY_GEN4_IMAGE_TURBO_MODEL_KEY,
  SEEDREAM_4_5_CAPABILITY_PROFILE_ID,
  SEEDREAM_4_5_CAPABILITY_PROFILE_VERSION,
  SEEDREAM_4_5_MODEL_KEY,
  SEEDREAM_4_CAPABILITY_PROFILE_ID,
  SEEDREAM_4_CAPABILITY_PROFILE_VERSION,
  SEEDREAM_4_MODEL_KEY,
  SEEDREAM_5_LITE_CAPABILITY_PROFILE_ID,
  SEEDREAM_5_LITE_MODEL_KEY,
  SEEDREAM_5_PRO_CAPABILITY_PROFILE_ID,
  SEEDREAM_5_PRO_CAPABILITY_PROFILE_VERSION,
  SEEDREAM_5_PRO_MODEL_KEY,
} from '@genfeedai/contracts/api-types/contracts/generation-capability-profile.contract';
import {
  MODEL_KEYS,
  MODEL_OUTPUT_CAPABILITIES,
} from '@genfeedai/contracts/constants';
import { describe, expect, it } from 'vitest';

const IMAGE_MODEL_KEYS = Object.entries(MODEL_OUTPUT_CAPABILITIES)
  .filter(([, capability]) => capability.category === ModelCategory.IMAGE)
  .map(([modelKey]) => modelKey);

interface ExpectedCompileSupport {
  compilerId: string;
  compilerVersion: number;
  modelKey: string;
  profileId: string;
  profileVersion: number;
}

const EXPECTED_COMPILE_SUPPORT: ReadonlyArray<ExpectedCompileSupport> = [
  {
    compilerId: FLUX_SCHNELL_IMAGE_COMPILER_ID,
    compilerVersion: FLUX_SCHNELL_IMAGE_COMPILER_VERSION,
    modelKey: FLUX_SCHNELL_MODEL_KEY,
    profileId: FLUX_SCHNELL_CAPABILITY_PROFILE_ID,
    profileVersion: FLUX_SCHNELL_CAPABILITY_PROFILE_VERSION,
  },
  {
    compilerId: FLUX_1_1_PRO_IMAGE_COMPILER_ID,
    compilerVersion: FLUX_1_1_PRO_IMAGE_COMPILER_VERSION,
    modelKey: FLUX_1_1_PRO_MODEL_KEY,
    profileId: FLUX_1_1_PRO_CAPABILITY_PROFILE_ID,
    profileVersion: FLUX_1_1_PRO_CAPABILITY_PROFILE_VERSION,
  },
  {
    compilerId: FLUX_2_DEV_IMAGE_COMPILER_ID,
    compilerVersion: FLUX_2_DEV_IMAGE_COMPILER_VERSION,
    modelKey: FLUX_2_DEV_MODEL_KEY,
    profileId: FLUX_2_DEV_CAPABILITY_PROFILE_ID,
    profileVersion: FLUX_2_DEV_CAPABILITY_PROFILE_VERSION,
  },
  {
    compilerId: FLUX_2_FLEX_IMAGE_COMPILER_ID,
    compilerVersion: FLUX_2_FLEX_IMAGE_COMPILER_VERSION,
    modelKey: FLUX_2_FLEX_MODEL_KEY,
    profileId: FLUX_2_FLEX_CAPABILITY_PROFILE_ID,
    profileVersion: FLUX_2_FLEX_CAPABILITY_PROFILE_VERSION,
  },
  {
    compilerId: FLUX_2_PRO_IMAGE_COMPILER_ID,
    compilerVersion: FLUX_2_PRO_IMAGE_COMPILER_VERSION,
    modelKey: FLUX_2_PRO_MODEL_KEY,
    profileId: FLUX_2_PRO_CAPABILITY_PROFILE_ID,
    profileVersion: FLUX_2_PRO_CAPABILITY_PROFILE_VERSION,
  },
  {
    compilerId: FLUX_2_PRO_IMAGE_COMPILER_ID,
    compilerVersion: FLUX_2_PRO_IMAGE_COMPILER_VERSION,
    modelKey: FLUX_2_MAX_MODEL_KEY,
    profileId: FLUX_2_MAX_CAPABILITY_PROFILE_ID,
    profileVersion: FLUX_2_PRO_CAPABILITY_PROFILE_VERSION,
  },
  {
    compilerId: FLUX_KONTEXT_PRO_IMAGE_COMPILER_ID,
    compilerVersion: FLUX_KONTEXT_PRO_IMAGE_COMPILER_VERSION,
    modelKey: FLUX_KONTEXT_PRO_MODEL_KEY,
    profileId: FLUX_KONTEXT_PRO_CAPABILITY_PROFILE_ID,
    profileVersion: FLUX_KONTEXT_PRO_CAPABILITY_PROFILE_VERSION,
  },
  {
    compilerId: FLUX_KONTEXT_PRO_IMAGE_COMPILER_ID,
    compilerVersion: FLUX_KONTEXT_PRO_IMAGE_COMPILER_VERSION,
    modelKey: FLUX_KONTEXT_MAX_MODEL_KEY,
    profileId: FLUX_KONTEXT_MAX_CAPABILITY_PROFILE_ID,
    profileVersion: FLUX_KONTEXT_PRO_CAPABILITY_PROFILE_VERSION,
  },
  {
    compilerId: IDEOGRAM_CHARACTER_IMAGE_COMPILER_ID,
    compilerVersion: IDEOGRAM_CHARACTER_IMAGE_COMPILER_VERSION,
    modelKey: IDEOGRAM_CHARACTER_MODEL_KEY,
    profileId: IDEOGRAM_CHARACTER_CAPABILITY_PROFILE_ID,
    profileVersion: IDEOGRAM_CAPABILITY_PROFILE_VERSION,
  },
  {
    compilerId: IDEOGRAM_V3_IMAGE_COMPILER_ID,
    compilerVersion: IDEOGRAM_V3_IMAGE_COMPILER_VERSION,
    modelKey: IDEOGRAM_V3_BALANCED_MODEL_KEY,
    profileId: IDEOGRAM_V3_BALANCED_CAPABILITY_PROFILE_ID,
    profileVersion: IDEOGRAM_V3_CAPABILITY_PROFILE_VERSION,
  },
  {
    compilerId: IDEOGRAM_V3_IMAGE_COMPILER_ID,
    compilerVersion: IDEOGRAM_V3_IMAGE_COMPILER_VERSION,
    modelKey: IDEOGRAM_V3_QUALITY_MODEL_KEY,
    profileId: IDEOGRAM_V3_QUALITY_CAPABILITY_PROFILE_ID,
    profileVersion: IDEOGRAM_V3_CAPABILITY_PROFILE_VERSION,
  },
  {
    compilerId: IDEOGRAM_V3_IMAGE_COMPILER_ID,
    compilerVersion: IDEOGRAM_V3_IMAGE_COMPILER_VERSION,
    modelKey: IDEOGRAM_V3_TURBO_MODEL_KEY,
    profileId: IDEOGRAM_V3_TURBO_CAPABILITY_PROFILE_ID,
    profileVersion: IDEOGRAM_V3_CAPABILITY_PROFILE_VERSION,
  },
  {
    compilerId: IMAGEN_IMAGE_COMPILER_ID,
    compilerVersion: IMAGEN_IMAGE_COMPILER_VERSION,
    modelKey: IMAGEN_3_MODEL_KEY,
    profileId: IMAGEN_3_CAPABILITY_PROFILE_ID,
    profileVersion: IMAGEN_CAPABILITY_PROFILE_VERSION,
  },
  {
    compilerId: IMAGEN_IMAGE_COMPILER_ID,
    compilerVersion: IMAGEN_IMAGE_COMPILER_VERSION,
    modelKey: IMAGEN_3_FAST_MODEL_KEY,
    profileId: IMAGEN_3_FAST_CAPABILITY_PROFILE_ID,
    profileVersion: IMAGEN_CAPABILITY_PROFILE_VERSION,
  },
  {
    compilerId: IMAGEN_IMAGE_COMPILER_ID,
    compilerVersion: IMAGEN_IMAGE_COMPILER_VERSION,
    modelKey: IMAGEN_4_MODEL_KEY,
    profileId: IMAGEN_4_CAPABILITY_PROFILE_ID,
    profileVersion: IMAGEN_CAPABILITY_PROFILE_VERSION,
  },
  {
    compilerId: IMAGEN_IMAGE_COMPILER_ID,
    compilerVersion: IMAGEN_IMAGE_COMPILER_VERSION,
    modelKey: IMAGEN_4_FAST_MODEL_KEY,
    profileId: IMAGEN_4_FAST_CAPABILITY_PROFILE_ID,
    profileVersion: IMAGEN_CAPABILITY_PROFILE_VERSION,
  },
  {
    compilerId: IMAGEN_IMAGE_COMPILER_ID,
    compilerVersion: IMAGEN_IMAGE_COMPILER_VERSION,
    modelKey: IMAGEN_4_ULTRA_MODEL_KEY,
    profileId: IMAGEN_4_ULTRA_CAPABILITY_PROFILE_ID,
    profileVersion: IMAGEN_CAPABILITY_PROFILE_VERSION,
  },
  {
    compilerId: NANO_BANANA_IMAGE_COMPILER_ID,
    compilerVersion: NANO_BANANA_IMAGE_COMPILER_VERSION,
    modelKey: NANO_BANANA_MODEL_KEY,
    profileId: NANO_BANANA_CAPABILITY_PROFILE_ID,
    profileVersion: NANO_BANANA_CAPABILITY_PROFILE_VERSION,
  },
  {
    compilerId: NANO_BANANA_2_IMAGE_COMPILER_ID,
    compilerVersion: NANO_BANANA_2_IMAGE_COMPILER_VERSION,
    modelKey: NANO_BANANA_PRO_MODEL_KEY,
    profileId: NANO_BANANA_PRO_CAPABILITY_PROFILE_ID,
    profileVersion: NANO_BANANA_2_CAPABILITY_PROFILE_VERSION,
  },
  {
    compilerId: NANO_BANANA_2_IMAGE_COMPILER_ID,
    compilerVersion: NANO_BANANA_2_IMAGE_COMPILER_VERSION,
    modelKey: NANO_BANANA_2_MODEL_KEY,
    profileId: NANO_BANANA_2_CAPABILITY_PROFILE_ID,
    profileVersion: NANO_BANANA_2_CAPABILITY_PROFILE_VERSION,
  },
  {
    compilerId: NANO_BANANA_2_IMAGE_COMPILER_ID,
    compilerVersion: NANO_BANANA_2_IMAGE_COMPILER_VERSION,
    modelKey: NANO_BANANA_2_LITE_MODEL_KEY,
    profileId: NANO_BANANA_2_LITE_CAPABILITY_PROFILE_ID,
    profileVersion: NANO_BANANA_2_CAPABILITY_PROFILE_VERSION,
  },
  {
    compilerId: SEEDREAM_4_IMAGE_COMPILER_ID,
    compilerVersion: SEEDREAM_4_IMAGE_COMPILER_VERSION,
    modelKey: SEEDREAM_4_MODEL_KEY,
    profileId: SEEDREAM_4_CAPABILITY_PROFILE_ID,
    profileVersion: SEEDREAM_4_CAPABILITY_PROFILE_VERSION,
  },
  {
    compilerId: SEEDREAM_4_5_IMAGE_COMPILER_ID,
    compilerVersion: SEEDREAM_4_5_IMAGE_COMPILER_VERSION,
    modelKey: SEEDREAM_4_5_MODEL_KEY,
    profileId: SEEDREAM_4_5_CAPABILITY_PROFILE_ID,
    profileVersion: SEEDREAM_4_5_CAPABILITY_PROFILE_VERSION,
  },
  {
    compilerId: SEEDREAM_4_5_IMAGE_COMPILER_ID,
    compilerVersion: SEEDREAM_4_5_IMAGE_COMPILER_VERSION,
    modelKey: SEEDREAM_5_LITE_MODEL_KEY,
    profileId: SEEDREAM_5_LITE_CAPABILITY_PROFILE_ID,
    profileVersion: SEEDREAM_4_5_CAPABILITY_PROFILE_VERSION,
  },
  {
    compilerId: SEEDREAM_5_PRO_IMAGE_COMPILER_ID,
    compilerVersion: SEEDREAM_5_PRO_IMAGE_COMPILER_VERSION,
    modelKey: SEEDREAM_5_PRO_MODEL_KEY,
    profileId: SEEDREAM_5_PRO_CAPABILITY_PROFILE_ID,
    profileVersion: SEEDREAM_5_PRO_CAPABILITY_PROFILE_VERSION,
  },
  {
    compilerId: QWEN_IMAGE_IMAGE_COMPILER_ID,
    compilerVersion: QWEN_IMAGE_IMAGE_COMPILER_VERSION,
    modelKey: QWEN_IMAGE_MODEL_KEY,
    profileId: QWEN_IMAGE_CAPABILITY_PROFILE_ID,
    profileVersion: QWEN_IMAGE_CAPABILITY_PROFILE_VERSION,
  },
  {
    compilerId: RUNWAY_GEN4_IMAGE_TURBO_IMAGE_COMPILER_ID,
    compilerVersion: RUNWAY_GEN4_IMAGE_TURBO_IMAGE_COMPILER_VERSION,
    modelKey: RUNWAY_GEN4_IMAGE_TURBO_MODEL_KEY,
    profileId: RUNWAY_GEN4_IMAGE_TURBO_CAPABILITY_PROFILE_ID,
    profileVersion: RUNWAY_GEN4_IMAGE_TURBO_CAPABILITY_PROFILE_VERSION,
  },
  ...REMAINING_IMAGE_GENERATION_BRIEF_FAMILIES.flatMap((family) =>
    family.profiles.map((profile) => ({
      compilerId: family.compilerId,
      compilerVersion: family.compilerVersion,
      modelKey: profile.modelKey,
      profileId: profile.id,
      profileVersion: profile.version,
    })),
  ),
];

const COMPILED_MODEL_KEYS = new Set(
  EXPECTED_COMPILE_SUPPORT.map((entry) => entry.modelKey),
);

const NON_GENERATIVE_TRANSFORM_MODEL_KEYS: ReadonlySet<string> = new Set([
  MODEL_KEYS.FAL_FACE_SWAP,
  MODEL_KEYS.FAL_UPSCALER,
  MODEL_KEYS.REPLICATE_TOPAZ_IMAGE_UPSCALE,
  MODEL_KEYS.REPLICATE_LUMA_REFRAME_IMAGE,
]);

const MODEL_TRAINING_OPERATION_MODEL_KEYS: ReadonlySet<string> = new Set([
  MODEL_KEYS.REPLICATE_FAST_FLUX_TRAINER,
]);

function expectedExemptionReasonFor(
  modelKey: string,
): GenerationBriefExemptionReason {
  if (NON_GENERATIVE_TRANSFORM_MODEL_KEYS.has(modelKey)) {
    return 'non_generative_transform';
  }
  if (MODEL_TRAINING_OPERATION_MODEL_KEYS.has(modelKey)) {
    return 'model_training_operation';
  }
  return 'legacy_prompt_builder';
}

describe('resolveImageGenerationBriefSupport', () => {
  it.each(EXPECTED_COMPILE_SUPPORT)(
    'compiles $modelKey through its registered compiler + profile',
    ({ compilerId, compilerVersion, modelKey, profileId, profileVersion }) => {
      expect(resolveImageGenerationBriefSupport(modelKey)).toEqual({
        compilerId,
        compilerVersion,
        kind: 'compile',
        modelKey,
        profileId,
        profileVersion,
      });
    },
  );

  it.each(
    IMAGE_MODEL_KEYS.filter((modelKey) => !COMPILED_MODEL_KEYS.has(modelKey)),
  )('exempts image model %s with its enumerated reason', (modelKey) => {
    expect(resolveImageGenerationBriefSupport(modelKey)).toEqual({
      compilerId: null,
      kind: 'exempt',
      modelKey,
      profileId: null,
      reason: expectedExemptionReasonFor(modelKey),
    });
  });

  it('never falls through to legacy_prompt_builder for an unrecognized model key', () => {
    expect(
      resolveImageGenerationBriefSupport('unknown-provider/unknown-model'),
    ).toEqual({
      compilerId: null,
      kind: 'exempt',
      modelKey: 'unknown-provider/unknown-model',
      profileId: null,
      reason: 'unregistered_model',
    });
  });

  it('covers every catalog image model key with either compile or exempt support', () => {
    for (const modelKey of IMAGE_MODEL_KEYS) {
      const support = resolveImageGenerationBriefSupport(modelKey);
      expect(['compile', 'exempt']).toContain(support.kind);
      if (support.kind === 'exempt') {
        expect(support.reason).not.toBe('unregistered_model');
      }
    }
  });
});
