/**
 * Compiles a canonical image generation brief into a FLUX 2 Pro dispatch
 * payload. Covers both FLUX 2 Pro and FLUX 2 Max, which share the identical
 * dispatch shape. The `input_images` field is optional and accepts up to 8
 * references — every included reference maps onto it as an array; anything
 * beyond the profile's max is recorded as an omitted signal. Neither tier has
 * a native negative-prompt field, so `avoid` constraints are always recorded
 * as an omitted signal (never rejected outright unless fidelity mode is
 * `strict`).
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
  Flux2ProDispatch,
  GenerationBriefCompileEvidence,
  GenerationBriefOmittedSignal,
} from '@genfeedai/contracts/api-types/contracts/generation-brief-compiler.contract';
import {
  FLUX_2_PRO_IMAGE_COMPILER_ID,
  FLUX_2_PRO_IMAGE_COMPILER_VERSION,
  flux2ProDispatchSchema,
} from '@genfeedai/contracts/api-types/contracts/generation-brief-compiler.contract';
import {
  FLUX_2_MAX_CAPABILITY_PROFILE,
  FLUX_2_PRO_CAPABILITY_PROFILE,
} from '@genfeedai/contracts/api-types/contracts/generation-capability-profile.contract';

const FLUX_2_PRO_MODEL_LABEL = 'FLUX 2 Pro';

const FLUX_2_PRO_CAPABILITY_PROFILES = [
  FLUX_2_PRO_CAPABILITY_PROFILE,
  FLUX_2_MAX_CAPABILITY_PROFILE,
];

const FLUX_2_PRO_CAPABILITY_PROFILE_BY_MODEL_KEY = Object.fromEntries(
  FLUX_2_PRO_CAPABILITY_PROFILES.map((profile) => [profile.modelKey, profile]),
);

export interface CompileFlux2ProGenerationBriefInput {
  brief: ImageGenerationBrief;
  modelKey: string;
  seed?: number;
}

export interface Flux2ProCompileResult {
  brief: ImageGenerationBrief;
  dispatch: Flux2ProDispatch;
  evidence: GenerationBriefCompileEvidence;
}

export function compileFlux2ProGenerationBrief(
  input: CompileFlux2ProGenerationBriefInput,
): Flux2ProCompileResult {
  const { brief, modelKey, seed } = input;
  const profile = FLUX_2_PRO_CAPABILITY_PROFILE_BY_MODEL_KEY[modelKey];
  if (!profile) {
    throw new GenerationBriefCompileError(
      `FLUX 2 Pro compiler received an unregistered model key: ${modelKey}.`,
      'invalid_brief',
    );
  }

  if (brief.mediaKind !== 'image') {
    throw new GenerationBriefCompileError(
      'FLUX 2 Pro compiler only supports image briefs.',
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
    FLUX_2_PRO_MODEL_LABEL,
  );

  const { appliedConstraintFields, prompt } = buildImageGenerationBriefPrompt({
    brief,
    maxCharacters: profile.prompt.maxCharacters,
    modelLabel: FLUX_2_PRO_MODEL_LABEL,
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

  const dispatch = flux2ProDispatchSchema.parse({
    aspect_ratio: aspectRatio,
    ...(included.length > 0
      ? { input_images: included.map((reference) => reference.assetId) }
      : {}),
    output_format: profile.defaults.outputFormat,
    output_quality: profile.defaults.outputQuality,
    prompt,
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
    compilerId: FLUX_2_PRO_IMAGE_COMPILER_ID,
    compilerVersion: FLUX_2_PRO_IMAGE_COMPILER_VERSION,
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
