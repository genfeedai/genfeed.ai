import type { GenerationBriefSupport } from '@api-types/contracts/generation-brief-compiler.contract';
import {
  FLUX_SCHNELL_IMAGE_COMPILER_ID,
  FLUX_SCHNELL_IMAGE_COMPILER_VERSION,
} from '@api-types/contracts/generation-brief-compiler.contract';
import {
  FLUX_SCHNELL_CAPABILITY_PROFILE_ID,
  FLUX_SCHNELL_CAPABILITY_PROFILE_VERSION,
  FLUX_SCHNELL_MODEL_KEY,
} from '@api-types/contracts/generation-capability-profile.contract';
import { MODEL_KEYS } from '@genfeedai/constants';

export function resolveImageGenerationBriefSupport(
  model: string,
): GenerationBriefSupport {
  if (model === MODEL_KEYS.REPLICATE_BLACK_FOREST_LABS_FLUX_SCHNELL) {
    return {
      compilerId: FLUX_SCHNELL_IMAGE_COMPILER_ID,
      compilerVersion: FLUX_SCHNELL_IMAGE_COMPILER_VERSION,
      kind: 'compile',
      modelKey: FLUX_SCHNELL_MODEL_KEY,
      profileId: FLUX_SCHNELL_CAPABILITY_PROFILE_ID,
      profileVersion: FLUX_SCHNELL_CAPABILITY_PROFILE_VERSION,
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
