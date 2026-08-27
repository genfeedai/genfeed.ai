import { resolveVideoGenerationBriefSupport } from '@server/services/generation-brief/resolve-video-generation-brief-support';
import {
  MINIMAX_H3_COMPILER_ID,
  MINIMAX_H3_COMPILER_VERSION,
  PRUNAAI_P_VIDEO_COMPILER_ID,
  PRUNAAI_P_VIDEO_COMPILER_VERSION,
} from '@api-types/contracts/video-generation-brief-compiler.contract';
import {
  MINIMAX_H3_CAPABILITY_PROFILE_ID,
  MINIMAX_H3_MODEL_KEY,
  PRUNAAI_P_VIDEO_CAPABILITY_PROFILE_ID,
  PRUNAAI_P_VIDEO_MODEL_KEY,
} from '@api-types/contracts/video-generation-capability-profile.contract';
import { MODEL_KEYS, MODEL_OUTPUT_CAPABILITIES } from '@genfeedai/constants';
import { ModelCategory } from '@genfeedai/enums';
import { describe, expect, it } from 'vitest';

const VIDEO_MODEL_KEYS = Object.entries(MODEL_OUTPUT_CAPABILITIES)
  .filter(([, capability]) => capability.category === ModelCategory.VIDEO)
  .map(([modelKey]) => modelKey);

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
    expect(PRUNAAI_P_VIDEO_MODEL_KEY).toBe(
      MODEL_KEYS.REPLICATE_PRUNAAI_P_VIDEO,
    );
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
      profileVersion: 1,
    });
    expect(MINIMAX_H3_MODEL_KEY).toBe(MODEL_KEYS.REPLICATE_MINIMAX_H3);
  });

  it.each(
    VIDEO_MODEL_KEYS.filter(
      (modelKey) =>
        modelKey !== MODEL_KEYS.REPLICATE_PRUNAAI_P_VIDEO &&
        modelKey !== MODEL_KEYS.REPLICATE_MINIMAX_H3,
    ),
  )('exempts video model %s from brief compilation', (modelKey) => {
    expect(resolveVideoGenerationBriefSupport(modelKey)).toEqual({
      compilerId: null,
      kind: 'exempt',
      modelKey,
      profileId: null,
      reason: 'legacy_prompt_builder',
    });
  });

  it('exempts non-catalog video providers instead of claiming brief support', () => {
    expect(
      resolveVideoGenerationBriefSupport(MODEL_KEYS.KLINGAI_V2),
    ).toMatchObject({
      kind: 'exempt',
      reason: 'legacy_prompt_builder',
    });
  });
});
