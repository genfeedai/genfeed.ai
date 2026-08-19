import { resolveImageGenerationBriefSupport } from '@api/services/generation-brief/resolve-image-generation-brief-support';
import {
  FLUX_SCHNELL_IMAGE_COMPILER_ID,
  FLUX_SCHNELL_IMAGE_COMPILER_VERSION,
} from '@api-types/contracts/generation-brief-compiler.contract';
import {
  FLUX_SCHNELL_CAPABILITY_PROFILE_ID,
  FLUX_SCHNELL_MODEL_KEY,
} from '@api-types/contracts/generation-capability-profile.contract';
import { MODEL_KEYS, MODEL_OUTPUT_CAPABILITIES } from '@genfeedai/constants';
import { ModelCategory } from '@genfeedai/enums';
import { describe, expect, it } from 'vitest';

const IMAGE_MODEL_KEYS = Object.entries(MODEL_OUTPUT_CAPABILITIES)
  .filter(([, capability]) => capability.category === ModelCategory.IMAGE)
  .map(([modelKey]) => modelKey);

describe('resolveImageGenerationBriefSupport', () => {
  it('compiles only FLUX Schnell through the versioned generation brief', () => {
    expect(
      resolveImageGenerationBriefSupport(
        MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_SCHNELL,
      ),
    ).toEqual({
      compilerId: FLUX_SCHNELL_IMAGE_COMPILER_ID,
      compilerVersion: FLUX_SCHNELL_IMAGE_COMPILER_VERSION,
      kind: 'compile',
      modelKey: FLUX_SCHNELL_MODEL_KEY,
      profileId: FLUX_SCHNELL_CAPABILITY_PROFILE_ID,
      profileVersion: 1,
    });
    expect(FLUX_SCHNELL_MODEL_KEY).toBe(
      MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_SCHNELL,
    );
  });

  it.each(
    IMAGE_MODEL_KEYS.filter(
      (modelKey) =>
        modelKey !== MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_SCHNELL,
    ),
  )('exempts image model %s from brief compilation', (modelKey) => {
    expect(resolveImageGenerationBriefSupport(modelKey)).toEqual({
      compilerId: null,
      kind: 'exempt',
      modelKey,
      profileId: null,
      reason: 'legacy_prompt_builder',
    });
  });

  it('exempts non-catalog image providers instead of claiming brief support', () => {
    expect(
      resolveImageGenerationBriefSupport(MODEL_KEYS.LEONARDOAI),
    ).toMatchObject({
      kind: 'exempt',
      reason: 'legacy_prompt_builder',
    });
    expect(
      resolveImageGenerationBriefSupport(MODEL_KEYS.FAL_NANO_BANANA_2),
    ).toMatchObject({
      kind: 'exempt',
      reason: 'legacy_prompt_builder',
    });
  });
});
