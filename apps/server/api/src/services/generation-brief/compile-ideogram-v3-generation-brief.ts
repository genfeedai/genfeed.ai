/**
 * Compiles a canonical image generation brief into an Ideogram V3 dispatch
 * payload. Covers all three Ideogram V3 tiers sharing the identical dispatch
 * shape: Balanced, Quality, and Turbo. The `image` field is optional — only
 * the first reference maps onto it; anything beyond that is recorded as an
 * omitted signal. Ideogram V3 has no native negative-prompt field, so `avoid`
 * constraints are always recorded as an omitted signal (never rejected
 * outright unless fidelity mode is `strict`). Ideogram V3 has no
 * `output_format` dispatch field, so evidence uses a documented implicit
 * output format.
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
  GenerationBriefCompileEvidence,
  GenerationBriefOmittedSignal,
  IdeogramV3Dispatch,
} from '@api-types/contracts/generation-brief-compiler.contract';
import {
  IDEOGRAM_V3_IMAGE_COMPILER_ID,
  IDEOGRAM_V3_IMAGE_COMPILER_VERSION,
  ideogramV3DispatchSchema,
} from '@api-types/contracts/generation-brief-compiler.contract';
import {
  IDEOGRAM_V3_BALANCED_CAPABILITY_PROFILE,
  IDEOGRAM_V3_QUALITY_CAPABILITY_PROFILE,
  IDEOGRAM_V3_TURBO_CAPABILITY_PROFILE,
} from '@api-types/contracts/generation-capability-profile.contract';

const IDEOGRAM_V3_MODEL_LABEL = 'Ideogram V3';
const IDEOGRAM_V3_IMPLICIT_OUTPUT_FORMAT = 'png';

const IDEOGRAM_V3_CAPABILITY_PROFILES = [
  IDEOGRAM_V3_BALANCED_CAPABILITY_PROFILE,
  IDEOGRAM_V3_QUALITY_CAPABILITY_PROFILE,
  IDEOGRAM_V3_TURBO_CAPABILITY_PROFILE,
];

const IDEOGRAM_V3_CAPABILITY_PROFILE_BY_MODEL_KEY = Object.fromEntries(
  IDEOGRAM_V3_CAPABILITY_PROFILES.map((profile) => [profile.modelKey, profile]),
);

export interface CompileIdeogramV3GenerationBriefInput {
  brief: ImageGenerationBrief;
  modelKey: string;
  seed?: number;
}

export interface IdeogramV3CompileResult {
  brief: ImageGenerationBrief;
  dispatch: IdeogramV3Dispatch;
  evidence: GenerationBriefCompileEvidence;
}

export function compileIdeogramV3GenerationBrief(
  input: CompileIdeogramV3GenerationBriefInput,
): IdeogramV3CompileResult {
  const { brief, modelKey, seed } = input;
  const profile = IDEOGRAM_V3_CAPABILITY_PROFILE_BY_MODEL_KEY[modelKey];
  if (!profile) {
    throw new GenerationBriefCompileError(
      `Ideogram V3 compiler received an unregistered model key: ${modelKey}.`,
      'invalid_brief',
    );
  }

  if (brief.mediaKind !== 'image') {
    throw new GenerationBriefCompileError(
      'Ideogram V3 compiler only supports image briefs.',
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
    IDEOGRAM_V3_MODEL_LABEL,
  );

  const { appliedConstraintFields, prompt } = buildImageGenerationBriefPrompt({
    brief,
    maxCharacters: profile.prompt.maxCharacters,
    modelLabel: IDEOGRAM_V3_MODEL_LABEL,
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

  const dispatch = ideogramV3DispatchSchema.parse({
    aspect_ratio: aspectRatio,
    ...(included[0] ? { image: included[0].assetId } : {}),
    magic_prompt_option: profile.defaults.magicPromptOption,
    prompt,
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
    compilerId: IDEOGRAM_V3_IMAGE_COMPILER_ID,
    compilerVersion: IDEOGRAM_V3_IMAGE_COMPILER_VERSION,
    hasSeed,
    modelKey,
    numOutputs: 1,
    omitted,
    outputAspectRatio: aspectRatio,
    outputFormat: IDEOGRAM_V3_IMPLICIT_OUTPUT_FORMAT,
    profileId: profile.id,
    profileVersion: profile.version,
  });

  return { brief, dispatch, evidence };
}
