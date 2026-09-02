/**
 * Compiles a canonical image generation brief into a FLUX 1.1 Pro dispatch
 * payload. The `image_prompt` field is optional — only the first reference
 * maps onto it; anything beyond that is recorded as an omitted signal. FLUX
 * 1.1 Pro has no native negative-prompt field, so `avoid` constraints are
 * always recorded as an omitted signal (never rejected outright unless
 * fidelity mode is `strict`).
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
import type { ImageGenerationBrief } from '@api-types/contracts/generation-brief.contract';
import { generationFidelityPolicies } from '@api-types/contracts/generation-brief.contract';
import type {
  Flux11ProDispatch,
  GenerationBriefCompileEvidence,
  GenerationBriefOmittedSignal,
} from '@api-types/contracts/generation-brief-compiler.contract';
import {
  FLUX_1_1_PRO_IMAGE_COMPILER_ID,
  FLUX_1_1_PRO_IMAGE_COMPILER_VERSION,
  flux11ProDispatchSchema,
} from '@api-types/contracts/generation-brief-compiler.contract';
import { FLUX_1_1_PRO_CAPABILITY_PROFILE } from '@api-types/contracts/generation-capability-profile.contract';

const FLUX_1_1_PRO_MODEL_LABEL = 'FLUX 1.1 Pro';

export interface CompileFlux11ProGenerationBriefInput {
  brief: ImageGenerationBrief;
  modelKey: string;
  seed?: number;
}

export interface Flux11ProCompileResult {
  brief: ImageGenerationBrief;
  dispatch: Flux11ProDispatch;
  evidence: GenerationBriefCompileEvidence;
}

export function compileFlux11ProGenerationBrief(
  input: CompileFlux11ProGenerationBriefInput,
): Flux11ProCompileResult {
  const { brief, modelKey, seed } = input;
  const profile = FLUX_1_1_PRO_CAPABILITY_PROFILE;
  if (modelKey !== profile.modelKey) {
    throw new GenerationBriefCompileError(
      `FLUX 1.1 Pro compiler received an unregistered model key: ${modelKey}.`,
      'invalid_brief',
    );
  }

  if (brief.mediaKind !== 'image') {
    throw new GenerationBriefCompileError(
      'FLUX 1.1 Pro compiler only supports image briefs.',
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
    FLUX_1_1_PRO_MODEL_LABEL,
  );

  const { appliedConstraintFields, prompt } = buildImageGenerationBriefPrompt({
    brief,
    maxCharacters: profile.prompt.maxCharacters,
    modelLabel: FLUX_1_1_PRO_MODEL_LABEL,
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

  const dispatch = flux11ProDispatchSchema.parse({
    aspect_ratio: aspectRatio,
    ...(included[0] ? { image_prompt: included[0].assetId } : {}),
    output_format: profile.defaults.outputFormat,
    output_quality: profile.defaults.outputQuality,
    prompt,
    prompt_upsampling: profile.defaults.promptUpsampling,
    safety_tolerance: profile.defaults.safetyTolerance,
    ...(hasSeed ? { seed } : {}),
  });

  const appliedFields = buildImageGenerationBriefAppliedFields({
    appliedConstraintFields,
    brief,
    hasSeed,
  });

  const evidence = buildImageGenerationBriefEvidence({
    appliedFields,
    brief,
    compilerId: FLUX_1_1_PRO_IMAGE_COMPILER_ID,
    compilerVersion: FLUX_1_1_PRO_IMAGE_COMPILER_VERSION,
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
