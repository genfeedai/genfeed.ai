/**
 * Compiles a canonical image generation brief into a Google Imagen dispatch
 * payload. Imagen has no reference-image support, so every reference in the
 * brief is recorded as an omitted signal via
 * {@link recordUnsupportedImageGenerationBriefReferences}. Imagen also has no
 * native negative-prompt field or text-rendering support, so `avoid`
 * constraints and requested text are always recorded as omitted signals
 * (never rejected outright unless fidelity mode is `strict`).
 *
 * Covers every Imagen model key sharing the identical dispatch shape:
 * imagen-3, imagen-3-fast, imagen-4, imagen-4-fast, imagen-4-ultra.
 */

import {
  buildImageGenerationBriefAppliedFields,
  buildImageGenerationBriefEvidence,
  buildImageGenerationBriefPrompt,
  recordUnsupportedImageGenerationBriefReferences,
  resolveImageGenerationBriefAspectRatio,
} from '@api/services/generation-brief/compile-image-generation-brief.util';
import { GenerationBriefCompileError } from '@api/services/generation-brief/generation-brief-compile.error';
import type { ImageGenerationBrief } from '@genfeedai/contracts/api-types/contracts/generation-brief.contract';
import { generationFidelityPolicies } from '@genfeedai/contracts/api-types/contracts/generation-brief.contract';
import type {
  GenerationBriefCompileEvidence,
  GenerationBriefOmittedSignal,
  ImagenDispatch,
} from '@genfeedai/contracts/api-types/contracts/generation-brief-compiler.contract';
import {
  IMAGEN_IMAGE_COMPILER_ID,
  IMAGEN_IMAGE_COMPILER_VERSION,
  imagenDispatchSchema,
} from '@genfeedai/contracts/api-types/contracts/generation-brief-compiler.contract';
import {
  IMAGEN_3_CAPABILITY_PROFILE,
  IMAGEN_3_FAST_CAPABILITY_PROFILE,
  IMAGEN_4_CAPABILITY_PROFILE,
  IMAGEN_4_FAST_CAPABILITY_PROFILE,
  IMAGEN_4_ULTRA_CAPABILITY_PROFILE,
} from '@genfeedai/contracts/api-types/contracts/generation-capability-profile.contract';

const IMAGEN_MODEL_LABEL = 'Imagen';

const IMAGEN_CAPABILITY_PROFILES = [
  IMAGEN_3_CAPABILITY_PROFILE,
  IMAGEN_3_FAST_CAPABILITY_PROFILE,
  IMAGEN_4_CAPABILITY_PROFILE,
  IMAGEN_4_FAST_CAPABILITY_PROFILE,
  IMAGEN_4_ULTRA_CAPABILITY_PROFILE,
];

const IMAGEN_CAPABILITY_PROFILE_BY_MODEL_KEY = Object.fromEntries(
  IMAGEN_CAPABILITY_PROFILES.map((profile) => [profile.modelKey, profile]),
);

export interface CompileImagenGenerationBriefInput {
  brief: ImageGenerationBrief;
  modelKey: string;
}

export interface ImagenCompileResult {
  brief: ImageGenerationBrief;
  dispatch: ImagenDispatch;
  evidence: GenerationBriefCompileEvidence;
}

export function compileImagenGenerationBrief(
  input: CompileImagenGenerationBriefInput,
): ImagenCompileResult {
  const { brief, modelKey } = input;
  const profile = IMAGEN_CAPABILITY_PROFILE_BY_MODEL_KEY[modelKey];
  if (!profile) {
    throw new GenerationBriefCompileError(
      `Imagen compiler received an unregistered model key: ${modelKey}.`,
      'invalid_brief',
    );
  }

  if (brief.mediaKind !== 'image') {
    throw new GenerationBriefCompileError(
      'Imagen compiler only supports image briefs.',
      'invalid_brief',
    );
  }

  const policy = generationFidelityPolicies[brief.fidelityMode];
  const omitted: GenerationBriefOmittedSignal[] = [];

  recordUnsupportedImageGenerationBriefReferences(
    omitted,
    brief,
    policy,
    IMAGEN_MODEL_LABEL,
  );

  const { appliedConstraintFields, prompt } = buildImageGenerationBriefPrompt({
    brief,
    maxCharacters: profile.prompt.maxCharacters,
    modelLabel: IMAGEN_MODEL_LABEL,
    omitted,
    policy,
    supportsNegativePrompt: false,
  });

  const aspectRatio = resolveImageGenerationBriefAspectRatio(
    modelKey,
    brief,
    profile.defaultAspectRatio,
  );

  const dispatch = imagenDispatchSchema.parse({
    aspect_ratio: aspectRatio,
    output_format: profile.defaults.outputFormat,
    prompt,
    safety_filter_level: profile.defaults.safetyFilterLevel,
  });

  const appliedFields = buildImageGenerationBriefAppliedFields({
    appliedConstraintFields,
    brief,
    hasSeed: false,
  });

  const evidence = buildImageGenerationBriefEvidence({
    appliedFields,
    brief,
    compilerId: IMAGEN_IMAGE_COMPILER_ID,
    compilerVersion: IMAGEN_IMAGE_COMPILER_VERSION,
    hasSeed: false,
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
