/**
 * Compiles a canonical image generation brief into a Google Nano Banana 2
 * family dispatch payload. Covers every sibling sharing the identical
 * dispatch shape: Nano Banana Pro, Nano Banana 2, Nano Banana 2 Lite.
 *
 * None of the three has a dispatch-side aspect-ratio field — the resolved
 * aspect ratio still feeds evidence via
 * {@link resolveImageGenerationBriefAspectRatio}, it is simply never spread
 * into the dispatch object. The capability profile's `resolution` flag only
 * toggles provider support; there is no brief-carried resolution-tier value
 * to map onto it, so the dispatch never sets `resolution` (a documented
 * simplification, not a fidelity loss — nothing in the brief is discarded).
 * Up to 14 references map onto the native `image_input` array; anything
 * beyond that is recorded as an omitted signal.
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
  NanoBanana2Dispatch,
} from '@api-types/contracts/generation-brief-compiler.contract';
import {
  NANO_BANANA_2_IMAGE_COMPILER_ID,
  NANO_BANANA_2_IMAGE_COMPILER_VERSION,
  nanoBanana2DispatchSchema,
} from '@api-types/contracts/generation-brief-compiler.contract';
import {
  NANO_BANANA_2_CAPABILITY_PROFILE,
  NANO_BANANA_2_LITE_CAPABILITY_PROFILE,
  NANO_BANANA_PRO_CAPABILITY_PROFILE,
} from '@api-types/contracts/generation-capability-profile.contract';

const NANO_BANANA_2_MODEL_LABEL = 'Nano Banana 2';

const NANO_BANANA_2_CAPABILITY_PROFILES = [
  NANO_BANANA_PRO_CAPABILITY_PROFILE,
  NANO_BANANA_2_CAPABILITY_PROFILE,
  NANO_BANANA_2_LITE_CAPABILITY_PROFILE,
];

const NANO_BANANA_2_CAPABILITY_PROFILE_BY_MODEL_KEY = Object.fromEntries(
  NANO_BANANA_2_CAPABILITY_PROFILES.map((profile) => [
    profile.modelKey,
    profile,
  ]),
);

export interface CompileNanoBanana2GenerationBriefInput {
  brief: ImageGenerationBrief;
  modelKey: string;
}

export interface NanoBanana2CompileResult {
  brief: ImageGenerationBrief;
  dispatch: NanoBanana2Dispatch;
  evidence: GenerationBriefCompileEvidence;
}

export function compileNanoBanana2GenerationBrief(
  input: CompileNanoBanana2GenerationBriefInput,
): NanoBanana2CompileResult {
  const { brief, modelKey } = input;
  const profile = NANO_BANANA_2_CAPABILITY_PROFILE_BY_MODEL_KEY[modelKey];
  if (!profile) {
    throw new GenerationBriefCompileError(
      `Nano Banana 2 compiler received an unregistered model key: ${modelKey}.`,
      'invalid_brief',
    );
  }

  if (brief.mediaKind !== 'image') {
    throw new GenerationBriefCompileError(
      'Nano Banana 2 compiler only supports image briefs.',
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
    NANO_BANANA_2_MODEL_LABEL,
  );

  const { appliedConstraintFields, prompt } = buildImageGenerationBriefPrompt({
    brief,
    maxCharacters: profile.prompt.maxCharacters,
    modelLabel: NANO_BANANA_2_MODEL_LABEL,
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

  const dispatch = nanoBanana2DispatchSchema.parse({
    ...(imageInput.length > 0 ? { image_input: imageInput } : {}),
    output_format: profile.defaults.outputFormat,
    prompt,
    ...(profile.defaults.safetyFilterLevel
      ? { safety_filter_level: profile.defaults.safetyFilterLevel }
      : {}),
  });

  const appliedFields = buildImageGenerationBriefAppliedFields({
    appliedConstraintFields,
    brief,
    hasSeed: false,
  });

  const evidence = buildImageGenerationBriefEvidence({
    appliedFields,
    brief,
    compilerId: NANO_BANANA_2_IMAGE_COMPILER_ID,
    compilerVersion: NANO_BANANA_2_IMAGE_COMPILER_VERSION,
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
