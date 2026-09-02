/**
 * Compiles a canonical image generation brief into a FLUX 2 Flex dispatch
 * payload. The `input_images` field is optional and accepts up to 10
 * references — every included reference maps onto it as an array; anything
 * beyond the profile's max is recorded as an omitted signal. FLUX 2 Flex has
 * no native negative-prompt field, so `avoid` constraints are always
 * recorded as an omitted signal (never rejected outright unless fidelity
 * mode is `strict`).
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
  Flux2FlexDispatch,
  GenerationBriefCompileEvidence,
  GenerationBriefOmittedSignal,
} from '@genfeedai/contracts/api-types/contracts/generation-brief-compiler.contract';
import {
  FLUX_2_FLEX_IMAGE_COMPILER_ID,
  FLUX_2_FLEX_IMAGE_COMPILER_VERSION,
  flux2FlexDispatchSchema,
} from '@genfeedai/contracts/api-types/contracts/generation-brief-compiler.contract';
import { FLUX_2_FLEX_CAPABILITY_PROFILE } from '@genfeedai/contracts/api-types/contracts/generation-capability-profile.contract';

const FLUX_2_FLEX_MODEL_LABEL = 'FLUX 2 Flex';

export interface CompileFlux2FlexGenerationBriefInput {
  brief: ImageGenerationBrief;
  modelKey: string;
  seed?: number;
}

export interface Flux2FlexCompileResult {
  brief: ImageGenerationBrief;
  dispatch: Flux2FlexDispatch;
  evidence: GenerationBriefCompileEvidence;
}

export function compileFlux2FlexGenerationBrief(
  input: CompileFlux2FlexGenerationBriefInput,
): Flux2FlexCompileResult {
  const { brief, modelKey, seed } = input;
  const profile = FLUX_2_FLEX_CAPABILITY_PROFILE;
  if (modelKey !== profile.modelKey) {
    throw new GenerationBriefCompileError(
      `FLUX 2 Flex compiler received an unregistered model key: ${modelKey}.`,
      'invalid_brief',
    );
  }

  if (brief.mediaKind !== 'image') {
    throw new GenerationBriefCompileError(
      'FLUX 2 Flex compiler only supports image briefs.',
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
    FLUX_2_FLEX_MODEL_LABEL,
  );

  const { appliedConstraintFields, prompt } = buildImageGenerationBriefPrompt({
    brief,
    maxCharacters: profile.prompt.maxCharacters,
    modelLabel: FLUX_2_FLEX_MODEL_LABEL,
    omitted,
    policy,
    supportsNegativePrompt: false,
  });

  const aspectRatio = resolveImageGenerationBriefAspectRatio(
    modelKey,
    brief,
    profile.defaultAspectRatio,
  );

  const hasSeed = seed !== undefined;

  const dispatch = flux2FlexDispatchSchema.parse({
    aspect_ratio: aspectRatio,
    guidance: profile.defaults.guidance,
    ...(included.length > 0
      ? { input_images: included.map((reference) => reference.assetId) }
      : {}),
    output_format: profile.defaults.outputFormat,
    output_quality: profile.defaults.outputQuality,
    prompt,
    prompt_upsampling: profile.defaults.promptUpsampling,
    safety_tolerance: profile.defaults.safetyTolerance,
    ...(hasSeed ? { seed } : {}),
    steps: profile.defaults.steps,
  });

  const appliedFields = buildImageGenerationBriefAppliedFields({
    appliedConstraintFields,
    brief,
    hasSeed,
  });

  const evidence = buildImageGenerationBriefEvidence({
    appliedFields,
    brief,
    compilerId: FLUX_2_FLEX_IMAGE_COMPILER_ID,
    compilerVersion: FLUX_2_FLEX_IMAGE_COMPILER_VERSION,
    hasSeed,
    modelKey,
    numOutputs: 1,
    omitted,
    outputAspectRatio: aspectRatio,
    outputFormat: profile.defaults.outputFormat,
    profileId: profile.id,
    profileVersion: profile.version,
  });

  return { brief, dispatch, evidence };
}
