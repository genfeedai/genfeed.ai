/**
 * Compiles a canonical image generation brief into a Qwen Image dispatch
 * payload. The `image` field is optional and accepts at most one reference;
 * anything beyond that is recorded as an omitted signal. Qwen Image is the
 * only image family with a native `negative_prompt` field, so `avoid`
 * constraints are mapped onto it directly rather than recorded as an omitted
 * signal.
 */

import {
  buildImageGenerationBriefAppliedFields,
  buildImageGenerationBriefEvidence,
  buildImageGenerationBriefPrompt,
  recordExcessImageGenerationBriefReferences,
  resolveImageGenerationBriefAspectRatio,
  selectImageGenerationBriefReferences,
} from '@api/services/generation-brief/compile-image-generation-brief.util';
import { GenerationBriefCompileError } from '@api/services/generation-brief/generation-brief-compile.error';
import type { ImageGenerationBrief } from '@genfeedai/contracts/api-types/contracts/generation-brief.contract';
import { generationFidelityPolicies } from '@genfeedai/contracts/api-types/contracts/generation-brief.contract';
import type {
  GenerationBriefCompileEvidence,
  GenerationBriefOmittedSignal,
  QwenImageDispatch,
} from '@genfeedai/contracts/api-types/contracts/generation-brief-compiler.contract';
import {
  QWEN_IMAGE_IMAGE_COMPILER_ID,
  QWEN_IMAGE_IMAGE_COMPILER_VERSION,
  qwenImageDispatchSchema,
} from '@genfeedai/contracts/api-types/contracts/generation-brief-compiler.contract';
import { QWEN_IMAGE_CAPABILITY_PROFILE } from '@genfeedai/contracts/api-types/contracts/generation-capability-profile.contract';

const QWEN_IMAGE_MODEL_LABEL = 'Qwen Image';

export interface CompileQwenImageGenerationBriefInput {
  brief: ImageGenerationBrief;
  modelKey: string;
  seed?: number;
}

export interface QwenImageCompileResult {
  brief: ImageGenerationBrief;
  dispatch: QwenImageDispatch;
  evidence: GenerationBriefCompileEvidence;
}

export function compileQwenImageGenerationBrief(
  input: CompileQwenImageGenerationBriefInput,
): QwenImageCompileResult {
  const { brief, modelKey, seed } = input;
  const profile = QWEN_IMAGE_CAPABILITY_PROFILE;
  if (modelKey !== profile.modelKey) {
    throw new GenerationBriefCompileError(
      `Qwen Image compiler received an unregistered model key: ${modelKey}.`,
      'invalid_brief',
    );
  }

  if (brief.mediaKind !== 'image') {
    throw new GenerationBriefCompileError(
      'Qwen Image compiler only supports image briefs.',
      'invalid_brief',
    );
  }

  const policy = generationFidelityPolicies[brief.fidelityMode];
  const omitted: GenerationBriefOmittedSignal[] = [];

  const { excludedCount, included } = selectImageGenerationBriefReferences(
    brief,
    profile.references.max,
  );
  recordExcessImageGenerationBriefReferences(
    omitted,
    excludedCount,
    profile.references.max,
    policy,
    brief.fidelityMode,
    QWEN_IMAGE_MODEL_LABEL,
  );

  const { appliedConstraintFields, negativePrompt, prompt } =
    buildImageGenerationBriefPrompt({
      brief,
      maxCharacters: profile.prompt.maxCharacters,
      modelLabel: QWEN_IMAGE_MODEL_LABEL,
      omitted,
      policy,
      supportsNegativePrompt: true,
    });

  const aspectRatio = resolveImageGenerationBriefAspectRatio(
    modelKey,
    brief,
    profile.defaultAspectRatio,
  );

  const hasSeed = seed !== undefined;

  const dispatch = qwenImageDispatchSchema.parse({
    aspect_ratio: aspectRatio,
    disable_safety_checker: profile.defaults.disableSafetyChecker,
    enhance_prompt: profile.defaults.enhancePrompt,
    go_fast: profile.defaults.goFast,
    guidance: profile.defaults.guidance,
    ...(included.length > 0 ? { image: included[0].assetId } : {}),
    ...(negativePrompt ? { negative_prompt: negativePrompt } : {}),
    num_inference_steps: profile.defaults.numInferenceSteps,
    output_format: profile.defaults.outputFormat,
    output_quality: profile.defaults.outputQuality,
    prompt,
    ...(hasSeed ? { seed } : {}),
    strength: profile.defaults.strength,
  });

  const appliedFields = buildImageGenerationBriefAppliedFields({
    appliedConstraintFields,
    brief,
    hasSeed,
  });

  const evidence = buildImageGenerationBriefEvidence({
    appliedFields,
    brief,
    compilerId: QWEN_IMAGE_IMAGE_COMPILER_ID,
    compilerVersion: QWEN_IMAGE_IMAGE_COMPILER_VERSION,
    hasSeed,
    modelKey,
    numOutputs: 1,
    omitted,
    outputAspectRatio: aspectRatio,
    outputFormat: profile.defaults.outputFormat,
    profileId: profile.id,
    profileVersion: profile.version,
    referenceAssetIds: included.map((reference) => reference.assetId),
  });

  return { brief, dispatch, evidence };
}
