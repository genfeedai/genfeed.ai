import { REMAINING_VIDEO_GENERATION_BRIEF_FAMILIES } from '@api/services/generation-brief/remaining-video-generation-brief-families';
import { resolveVideoGenerationBriefSupport } from '@api/services/generation-brief/resolve-video-generation-brief-support';
import { ModelCategory } from '@genfeedai/contracts';
import {
  MINIMAX_H3_COMPILER_ID,
  MINIMAX_H3_COMPILER_VERSION,
  PRUNAAI_P_VIDEO_COMPILER_ID,
  PRUNAAI_P_VIDEO_COMPILER_VERSION,
} from '@genfeedai/contracts/api-types/contracts/video-generation-brief-compiler.contract';
import {
  MINIMAX_H3_CAPABILITY_PROFILE_ID,
  MINIMAX_H3_CAPABILITY_PROFILE_VERSION,
  MINIMAX_H3_MODEL_KEY,
  PRUNAAI_P_VIDEO_CAPABILITY_PROFILE_ID,
  PRUNAAI_P_VIDEO_MODEL_KEY,
} from '@genfeedai/contracts/api-types/contracts/video-generation-capability-profile.contract';
import {
  MODEL_KEYS,
  MODEL_OUTPUT_CAPABILITIES,
} from '@genfeedai/contracts/constants';
import { describe, expect, it } from 'vitest';

const VIDEO_MODEL_KEYS = Object.entries(MODEL_OUTPUT_CAPABILITIES)
  .filter(([, capability]) => capability.category === ModelCategory.VIDEO)
  .map(([modelKey]) => modelKey);

const COMPILED_REMAINING_MODEL_KEYS = new Set(
  REMAINING_VIDEO_GENERATION_BRIEF_FAMILIES.flatMap((family) =>
    family.profiles.map((profile) => profile.modelKey),
  ),
);

describe('resolveVideoGenerationBriefSupport', () => {
  it('compiles PrunaAI P-Video through the versioned generation brief', () => {
    expect(
      resolveVideoGenerationBriefSupport(MODEL_KEYS.REPLICATE_PRUNAAI_P_VIDEO),
    ).toEqual({
      compilerId: PRUNAAI_P_VIDEO_COMPILER_ID,
      compilerVersion: PRUNAAI_P_VIDEO_COMPILER_VERSION,
      kind: 'compile',
      modelKey: PRUNAAI_P_VIDEO_MODEL_KEY,
      profileId: PRUNAAI_P_VIDEO_CAPABILITY_PROFILE_ID,
      profileVersion: 1,
    });
  });

  it('compiles MiniMax H3 through the versioned generation brief', () => {
    expect(
      resolveVideoGenerationBriefSupport(MODEL_KEYS.REPLICATE_MINIMAX_H3),
    ).toEqual({
      compilerId: MINIMAX_H3_COMPILER_ID,
      compilerVersion: MINIMAX_H3_COMPILER_VERSION,
      kind: 'compile',
      modelKey: MINIMAX_H3_MODEL_KEY,
      profileId: MINIMAX_H3_CAPABILITY_PROFILE_ID,
      profileVersion: MINIMAX_H3_CAPABILITY_PROFILE_VERSION,
    });
  });

  it.each([...COMPILED_REMAINING_MODEL_KEYS])(
    'compiles remaining video model %s',
    (modelKey) => {
      expect(resolveVideoGenerationBriefSupport(modelKey).kind).toBe('compile');
    },
  );

  it('covers every catalog video model key with compile support', () => {
    for (const modelKey of VIDEO_MODEL_KEYS) {
      expect(resolveVideoGenerationBriefSupport(modelKey).kind).toBe('compile');
    }
  });

  it('exempts non-generative video transforms', () => {
    expect(
      resolveVideoGenerationBriefSupport(
        MODEL_KEYS.REPLICATE_TOPAZ_VIDEO_UPSCALE,
      ),
    ).toMatchObject({
      kind: 'exempt',
      reason: 'non_generative_transform',
    });
  });

  it('never falls through to legacy_prompt_builder for an unrecognized model key', () => {
    expect(
      resolveVideoGenerationBriefSupport('unknown-provider/unknown-model'),
    ).toEqual({
      compilerId: null,
      kind: 'exempt',
      modelKey: 'unknown-provider/unknown-model',
      profileId: null,
      reason: 'unregistered_model',
    });
  });
});
