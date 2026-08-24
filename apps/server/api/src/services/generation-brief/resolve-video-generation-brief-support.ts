import type { VideoGenerationBriefSupport } from '@api-types/contracts/video-generation-brief-compiler.contract';
import {
  MINIMAX_H3_COMPILER_ID,
  MINIMAX_H3_COMPILER_VERSION,
  PRUNAAI_P_VIDEO_COMPILER_ID,
  PRUNAAI_P_VIDEO_COMPILER_VERSION,
} from '@api-types/contracts/video-generation-brief-compiler.contract';
import {
  MINIMAX_H3_CAPABILITY_PROFILE_ID,
  MINIMAX_H3_CAPABILITY_PROFILE_VERSION,
  MINIMAX_H3_MODEL_KEY,
  PRUNAAI_P_VIDEO_CAPABILITY_PROFILE_ID,
  PRUNAAI_P_VIDEO_CAPABILITY_PROFILE_VERSION,
  PRUNAAI_P_VIDEO_MODEL_KEY,
} from '@api-types/contracts/video-generation-capability-profile.contract';
import { MODEL_KEYS } from '@genfeedai/constants';

export function resolveVideoGenerationBriefSupport(
  model: string,
): VideoGenerationBriefSupport {
  if (model === MODEL_KEYS.REPLICATE_PRUNAAI_P_VIDEO) {
    return {
      compilerId: PRUNAAI_P_VIDEO_COMPILER_ID,
      compilerVersion: PRUNAAI_P_VIDEO_COMPILER_VERSION,
      kind: 'compile',
      modelKey: PRUNAAI_P_VIDEO_MODEL_KEY,
      profileId: PRUNAAI_P_VIDEO_CAPABILITY_PROFILE_ID,
      profileVersion: PRUNAAI_P_VIDEO_CAPABILITY_PROFILE_VERSION,
    };
  }

  if (model === MODEL_KEYS.REPLICATE_MINIMAX_H3) {
    return {
      compilerId: MINIMAX_H3_COMPILER_ID,
      compilerVersion: MINIMAX_H3_COMPILER_VERSION,
      kind: 'compile',
      modelKey: MINIMAX_H3_MODEL_KEY,
      profileId: MINIMAX_H3_CAPABILITY_PROFILE_ID,
      profileVersion: MINIMAX_H3_CAPABILITY_PROFILE_VERSION,
    };
  }

  return {
    compilerId: null,
    kind: 'exempt',
    modelKey: model,
    profileId: null,
    reason: 'legacy_prompt_builder',
  };
}
