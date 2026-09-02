/**
 * Compiles a canonical image generation brief into a RunwayML Gen4 Image
 * Turbo dispatch payload. The dispatch shape has no `aspect_ratio` or
 * `output_format` field at all — aspect ratio is still resolved for evidence
 * purposes only (never spread into dispatch), and the output format is
 * recorded in evidence as an implicit constant since the provider has no
 * output-format concept in dispatch. `reference_images` accepts up to 3
 * references; anything beyond that is recorded as an omitted signal. There is
 * no native negative-prompt field, so `avoid` constraints are always
 * recorded as an omitted signal (never rejected outright unless fidelity mode
 * is `strict`).
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
  RunwayGen4ImageTurboDispatch,
} from '@genfeedai/contracts/api-types/contracts/generation-brief-compiler.contract';
import {
  RUNWAY_GEN4_IMAGE_TURBO_IMAGE_COMPILER_ID,
  RUNWAY_GEN4_IMAGE_TURBO_IMAGE_COMPILER_VERSION,
  runwayGen4ImageTurboDispatchSchema,
} from '@genfeedai/contracts/api-types/contracts/generation-brief-compiler.contract';
import { RUNWAY_GEN4_IMAGE_TURBO_CAPABILITY_PROFILE } from '@genfeedai/contracts/api-types/contracts/generation-capability-profile.contract';

const RUNWAY_GEN4_IMAGE_TURBO_MODEL_LABEL = 'RunwayML Gen4 Image Turbo';
const RUNWAY_GEN4_IMAGE_TURBO_IMPLICIT_OUTPUT_FORMAT = 'png';

export interface CompileRunwayGen4ImageTurboGenerationBriefInput {
  brief: ImageGenerationBrief;
  modelKey: string;
  seed?: number;
}

export interface RunwayGen4ImageTurboCompileResult {
  brief: ImageGenerationBrief;
  dispatch: RunwayGen4ImageTurboDispatch;
  evidence: GenerationBriefCompileEvidence;
}

export function compileRunwayGen4ImageTurboGenerationBrief(
  input: CompileRunwayGen4ImageTurboGenerationBriefInput,
): RunwayGen4ImageTurboCompileResult {
  const { brief, modelKey, seed } = input;
  const profile = RUNWAY_GEN4_IMAGE_TURBO_CAPABILITY_PROFILE;
  if (modelKey !== profile.modelKey) {
    throw new GenerationBriefCompileError(
      `RunwayML Gen4 Image Turbo compiler received an unregistered model key: ${modelKey}.`,
      'invalid_brief',
    );
  }

  if (brief.mediaKind !== 'image') {
    throw new GenerationBriefCompileError(
      'RunwayML Gen4 Image Turbo compiler only supports image briefs.',
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
    RUNWAY_GEN4_IMAGE_TURBO_MODEL_LABEL,
  );

  const { appliedConstraintFields, prompt } = buildImageGenerationBriefPrompt({
    brief,
    maxCharacters: profile.prompt.maxCharacters,
    modelLabel: RUNWAY_GEN4_IMAGE_TURBO_MODEL_LABEL,
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

  const dispatch = runwayGen4ImageTurboDispatchSchema.parse({
    prompt,
    ...(included.length > 0
      ? { reference_images: included.map((reference) => reference.assetId) }
      : {}),
    resolution: profile.defaults.resolution,
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
    compilerId: RUNWAY_GEN4_IMAGE_TURBO_IMAGE_COMPILER_ID,
    compilerVersion: RUNWAY_GEN4_IMAGE_TURBO_IMAGE_COMPILER_VERSION,
    hasSeed,
    modelKey,
    numOutputs: 1,
    omitted,
    outputAspectRatio: aspectRatio,
    outputFormat: RUNWAY_GEN4_IMAGE_TURBO_IMPLICIT_OUTPUT_FORMAT,
    profileId: profile.id,
    profileVersion: profile.version,
  });

  return { brief, dispatch, evidence };
}
