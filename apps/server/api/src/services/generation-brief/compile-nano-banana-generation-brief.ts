/**
 * Compiles a canonical image generation brief into a Google Nano Banana
 * dispatch payload. Nano Banana has no dispatch-side aspect-ratio field, no
 * negative-prompt field, and only prompt-embedded text rendering — the
 * resolved aspect ratio still feeds evidence via
 * {@link resolveImageGenerationBriefAspectRatio}, it is simply never spread
 * into the dispatch object. Up to 15 references map onto the native
 * `image_input` array; anything beyond that is recorded as an omitted signal.
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
  NanoBananaDispatch,
} from '@genfeedai/contracts/api-types/contracts/generation-brief-compiler.contract';
import {
  NANO_BANANA_IMAGE_COMPILER_ID,
  NANO_BANANA_IMAGE_COMPILER_VERSION,
  nanoBananaDispatchSchema,
} from '@genfeedai/contracts/api-types/contracts/generation-brief-compiler.contract';
import { NANO_BANANA_CAPABILITY_PROFILE } from '@genfeedai/contracts/api-types/contracts/generation-capability-profile.contract';

const NANO_BANANA_MODEL_LABEL = 'Nano Banana';

export interface CompileNanoBananaGenerationBriefInput {
  brief: ImageGenerationBrief;
  modelKey: string;
}

export interface NanoBananaCompileResult {
  brief: ImageGenerationBrief;
  dispatch: NanoBananaDispatch;
  evidence: GenerationBriefCompileEvidence;
}

export function compileNanoBananaGenerationBrief(
  input: CompileNanoBananaGenerationBriefInput,
): NanoBananaCompileResult {
  const { brief, modelKey } = input;
  const profile = NANO_BANANA_CAPABILITY_PROFILE;
  if (modelKey !== profile.modelKey) {
    throw new GenerationBriefCompileError(
      `Nano Banana compiler received an unregistered model key: ${modelKey}.`,
      'invalid_brief',
    );
  }

  if (brief.mediaKind !== 'image') {
    throw new GenerationBriefCompileError(
      'Nano Banana compiler only supports image briefs.',
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
    NANO_BANANA_MODEL_LABEL,
  );

  const { appliedConstraintFields, prompt } = buildImageGenerationBriefPrompt({
    brief,
    maxCharacters: profile.prompt.maxCharacters,
    modelLabel: NANO_BANANA_MODEL_LABEL,
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

  const dispatch = nanoBananaDispatchSchema.parse({
    ...(imageInput.length > 0 ? { image_input: imageInput } : {}),
    output_format: profile.defaults.outputFormat,
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
    compilerId: NANO_BANANA_IMAGE_COMPILER_ID,
    compilerVersion: NANO_BANANA_IMAGE_COMPILER_VERSION,
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
