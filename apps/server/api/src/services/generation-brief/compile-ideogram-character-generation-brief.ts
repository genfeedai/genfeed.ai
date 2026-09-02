/**
 * Compiles a canonical image generation brief into an Ideogram Character
 * dispatch payload. Ideogram Character's `character_reference_image` field is
 * a structural dispatch requirement, not a fidelity-policy trade-off — a
 * brief with zero references is rejected via
 * {@link assertRequiredImageGenerationBriefReference} regardless of
 * `fidelityMode`. Only the first reference maps onto the field; anything
 * beyond that is recorded as an omitted signal. Ideogram Character has no
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
import type { ImageGenerationBrief } from '@api-types/contracts/generation-brief.contract';
import { generationFidelityPolicies } from '@api-types/contracts/generation-brief.contract';
import type {
  GenerationBriefCompileEvidence,
  GenerationBriefOmittedSignal,
  IdeogramCharacterDispatch,
} from '@api-types/contracts/generation-brief-compiler.contract';
import {
  IDEOGRAM_CHARACTER_IMAGE_COMPILER_ID,
  IDEOGRAM_CHARACTER_IMAGE_COMPILER_VERSION,
  ideogramCharacterDispatchSchema,
} from '@api-types/contracts/generation-brief-compiler.contract';
import { IDEOGRAM_CHARACTER_CAPABILITY_PROFILE } from '@api-types/contracts/generation-capability-profile.contract';

const IDEOGRAM_CHARACTER_MODEL_LABEL = 'Ideogram Character';

export interface CompileIdeogramCharacterGenerationBriefInput {
  brief: ImageGenerationBrief;
  modelKey: string;
  seed?: number;
}

export interface IdeogramCharacterCompileResult {
  brief: ImageGenerationBrief;
  dispatch: IdeogramCharacterDispatch;
  evidence: GenerationBriefCompileEvidence;
}

export function compileIdeogramCharacterGenerationBrief(
  input: CompileIdeogramCharacterGenerationBriefInput,
): IdeogramCharacterCompileResult {
  const { brief, modelKey, seed } = input;
  const profile = IDEOGRAM_CHARACTER_CAPABILITY_PROFILE;
  if (modelKey !== profile.modelKey) {
    throw new GenerationBriefCompileError(
      `Ideogram Character compiler received an unregistered model key: ${modelKey}.`,
      'invalid_brief',
    );
  }

  if (brief.mediaKind !== 'image') {
    throw new GenerationBriefCompileError(
      'Ideogram Character compiler only supports image briefs.',
      'invalid_brief',
    );
  }

  assertRequiredImageGenerationBriefReference(
    brief,
    IDEOGRAM_CHARACTER_MODEL_LABEL,
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
    IDEOGRAM_CHARACTER_MODEL_LABEL,
  );

  const { appliedConstraintFields, prompt } = buildImageGenerationBriefPrompt({
    brief,
    maxCharacters: profile.prompt.maxCharacters,
    modelLabel: IDEOGRAM_CHARACTER_MODEL_LABEL,
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

  const dispatch = ideogramCharacterDispatchSchema.parse({
    aspect_ratio: aspectRatio,
    character_reference_image: included[0].assetId,
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
    compilerId: IDEOGRAM_CHARACTER_IMAGE_COMPILER_ID,
    compilerVersion: IDEOGRAM_CHARACTER_IMAGE_COMPILER_VERSION,
    hasSeed,
    modelKey,
    numOutputs: 1,
    omitted,
    outputAspectRatio: aspectRatio,
    outputFormat: 'png',
    profileId: profile.id,
    profileVersion: profile.version,
  });

  return { brief, dispatch, evidence };
}
