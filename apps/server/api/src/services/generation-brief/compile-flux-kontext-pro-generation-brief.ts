/**
 * Compiles a canonical image generation brief into a FLUX Kontext Pro dispatch
 * payload. Covers both FLUX Kontext Pro and FLUX Kontext Max, which share the
 * identical dispatch shape. `input_image` is a structural dispatch
 * requirement, not a fidelity-policy trade-off — a brief with zero references
 * is rejected via {@link assertRequiredImageGenerationBriefReference}
 * regardless of `fidelityMode`. Only the first reference maps onto the field;
 * anything beyond that is recorded as an omitted signal. Neither tier has a
 * native negative-prompt field, so `avoid` constraints are always recorded as
 * an omitted signal (never rejected outright unless fidelity mode is
 * `strict`).
 */

import {
  assertRequiredImageGenerationBriefReference,
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
  FluxKontextProDispatch,
  GenerationBriefCompileEvidence,
  GenerationBriefOmittedSignal,
} from '@genfeedai/contracts/api-types/contracts/generation-brief-compiler.contract';
import {
  FLUX_KONTEXT_PRO_IMAGE_COMPILER_ID,
  FLUX_KONTEXT_PRO_IMAGE_COMPILER_VERSION,
  fluxKontextProDispatchSchema,
} from '@genfeedai/contracts/api-types/contracts/generation-brief-compiler.contract';
import {
  FLUX_KONTEXT_MAX_CAPABILITY_PROFILE,
  FLUX_KONTEXT_PRO_CAPABILITY_PROFILE,
} from '@genfeedai/contracts/api-types/contracts/generation-capability-profile.contract';

const FLUX_KONTEXT_PRO_MODEL_LABEL = 'FLUX Kontext Pro';

const FLUX_KONTEXT_PRO_CAPABILITY_PROFILES = [
  FLUX_KONTEXT_PRO_CAPABILITY_PROFILE,
  FLUX_KONTEXT_MAX_CAPABILITY_PROFILE,
];

const FLUX_KONTEXT_PRO_CAPABILITY_PROFILE_BY_MODEL_KEY = Object.fromEntries(
  FLUX_KONTEXT_PRO_CAPABILITY_PROFILES.map((profile) => [
    profile.modelKey,
    profile,
  ]),
);

export interface CompileFluxKontextProGenerationBriefInput {
  brief: ImageGenerationBrief;
  modelKey: string;
  seed?: number;
}

export interface FluxKontextProCompileResult {
  brief: ImageGenerationBrief;
  dispatch: FluxKontextProDispatch;
  evidence: GenerationBriefCompileEvidence;
}

export function compileFluxKontextProGenerationBrief(
  input: CompileFluxKontextProGenerationBriefInput,
): FluxKontextProCompileResult {
  const { brief, modelKey, seed } = input;
  const profile = FLUX_KONTEXT_PRO_CAPABILITY_PROFILE_BY_MODEL_KEY[modelKey];
  if (!profile) {
    throw new GenerationBriefCompileError(
      `FLUX Kontext Pro compiler received an unregistered model key: ${modelKey}.`,
      'invalid_brief',
    );
  }

  if (brief.mediaKind !== 'image') {
    throw new GenerationBriefCompileError(
      'FLUX Kontext Pro compiler only supports image briefs.',
      'invalid_brief',
    );
  }

  assertRequiredImageGenerationBriefReference(
    brief,
    FLUX_KONTEXT_PRO_MODEL_LABEL,
  );

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
    FLUX_KONTEXT_PRO_MODEL_LABEL,
  );

  const { appliedConstraintFields, prompt } = buildImageGenerationBriefPrompt({
    brief,
    maxCharacters: profile.prompt.maxCharacters,
    modelLabel: FLUX_KONTEXT_PRO_MODEL_LABEL,
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

  const dispatch = fluxKontextProDispatchSchema.parse({
    aspect_ratio: aspectRatio,
    input_image: included[0].assetId,
    output_format: profile.defaults.outputFormat,
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
    compilerId: FLUX_KONTEXT_PRO_IMAGE_COMPILER_ID,
    compilerVersion: FLUX_KONTEXT_PRO_IMAGE_COMPILER_VERSION,
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
