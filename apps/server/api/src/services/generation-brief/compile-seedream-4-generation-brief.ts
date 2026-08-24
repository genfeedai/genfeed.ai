/**
 * Compiles a canonical image generation brief into a ByteDance SeeDream 4
 * dispatch payload. Unlike the Nano Banana family, SeeDream 4 carries a
 * native `aspect_ratio` dispatch field, so the resolved aspect ratio is both
 * evidence and dispatch. `enhance_prompt` is always sourced from the
 * capability profile's `defaults.enhancePrompt` — there is no brief-carried
 * signal to override it. Up to 10 references map onto the native
 * `image_input` array; anything beyond that is recorded as an omitted
 * signal.
 *
 * SeeDream 4's dispatch schema (and capability profile `defaults`) carries no
 * output-format field at all -- the provider always returns PNG. Evidence
 * still requires a non-empty `output.outputFormat`, so this compiler records
 * the provider's fixed implicit format rather than inventing a dispatch
 * field the schema does not have.
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
  Seedream4Dispatch,
} from '@api-types/contracts/generation-brief-compiler.contract';
import {
  SEEDREAM_4_IMAGE_COMPILER_ID,
  SEEDREAM_4_IMAGE_COMPILER_VERSION,
  seedream4DispatchSchema,
} from '@api-types/contracts/generation-brief-compiler.contract';
import { SEEDREAM_4_CAPABILITY_PROFILE } from '@api-types/contracts/generation-capability-profile.contract';

const SEEDREAM_4_IMPLICIT_OUTPUT_FORMAT = 'png';
const SEEDREAM_4_MODEL_LABEL = 'SeeDream 4';

export interface CompileSeedream4GenerationBriefInput {
  brief: ImageGenerationBrief;
  modelKey: string;
}

export interface Seedream4CompileResult {
  brief: ImageGenerationBrief;
  dispatch: Seedream4Dispatch;
  evidence: GenerationBriefCompileEvidence;
}

export function compileSeedream4GenerationBrief(
  input: CompileSeedream4GenerationBriefInput,
): Seedream4CompileResult {
  const { brief, modelKey } = input;
  const profile = SEEDREAM_4_CAPABILITY_PROFILE;
  if (modelKey !== profile.modelKey) {
    throw new GenerationBriefCompileError(
      `SeeDream 4 compiler received an unregistered model key: ${modelKey}.`,
      'invalid_brief',
    );
  }

  if (brief.mediaKind !== 'image') {
    throw new GenerationBriefCompileError(
      'SeeDream 4 compiler only supports image briefs.',
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
    SEEDREAM_4_MODEL_LABEL,
  );

  const { appliedConstraintFields, prompt } = buildImageGenerationBriefPrompt({
    brief,
    maxCharacters: profile.prompt.maxCharacters,
    modelLabel: SEEDREAM_4_MODEL_LABEL,
    omitted,
    policy,
    supportsNegativePrompt: false,
  });

  const aspectRatio = resolveImageGenerationBriefAspectRatio(
    modelKey,
    brief,
    profile.defaultAspectRatio,
  );

  const imageInput = included.map((reference) => reference.assetId);

  const dispatch = seedream4DispatchSchema.parse({
    aspect_ratio: aspectRatio,
    enhance_prompt: profile.defaults.enhancePrompt,
    ...(imageInput.length > 0 ? { image_input: imageInput } : {}),
    prompt,
  });

  const appliedFields = buildImageGenerationBriefAppliedFields({
    appliedConstraintFields,
    brief,
    hasSeed: false,
  });

  const evidence = buildImageGenerationBriefEvidence({
    appliedFields,
    brief,
    compilerId: SEEDREAM_4_IMAGE_COMPILER_ID,
    compilerVersion: SEEDREAM_4_IMAGE_COMPILER_VERSION,
    hasSeed: false,
    modelKey,
    numOutputs: 1,
    omitted,
    outputAspectRatio: aspectRatio,
    outputFormat: SEEDREAM_4_IMPLICIT_OUTPUT_FORMAT,
    profileId: profile.id,
    profileVersion: profile.version,
  });

  return { brief, dispatch, evidence };
}
