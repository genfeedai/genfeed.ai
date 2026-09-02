/**
 * Compiles a canonical image generation brief into a ByteDance SeeDream 4.5
 * family dispatch payload. Covers both siblings sharing the identical
 * dispatch shape: SeeDream 4.5 and SeeDream 5 Lite.
 *
 * Neither sibling has a dispatch-side `aspect_ratio` field — dispatch instead
 * carries a `size` tier (e.g. `'2K'`) sourced from the capability profile's
 * `defaults.size`, which is not overridden by any brief-carried signal. The
 * resolved aspect ratio still feeds evidence via
 * {@link resolveImageGenerationBriefAspectRatio}; it is simply never spread
 * into the dispatch object, the same documented simplification used for the
 * Nano Banana 2 family's resolution tier.
 *
 * Neither sibling's dispatch schema (nor capability profile `defaults`)
 * carries an output-format field at all -- the provider always returns PNG.
 * Evidence still requires a non-empty `output.outputFormat`, so this compiler
 * records the provider's fixed implicit format rather than inventing a
 * dispatch field the schema does not have (the same workaround used for
 * SeeDream 4).
 *
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
  Seedream45Dispatch,
} from '@api-types/contracts/generation-brief-compiler.contract';
import {
  SEEDREAM_4_5_IMAGE_COMPILER_ID,
  SEEDREAM_4_5_IMAGE_COMPILER_VERSION,
  seedream45DispatchSchema,
} from '@api-types/contracts/generation-brief-compiler.contract';
import {
  SEEDREAM_4_5_CAPABILITY_PROFILE,
  SEEDREAM_5_LITE_CAPABILITY_PROFILE,
} from '@api-types/contracts/generation-capability-profile.contract';

const SEEDREAM_4_5_IMPLICIT_OUTPUT_FORMAT = 'png';
const SEEDREAM_4_5_MODEL_LABEL = 'SeeDream 4.5';

const SEEDREAM_4_5_CAPABILITY_PROFILES = [
  SEEDREAM_4_5_CAPABILITY_PROFILE,
  SEEDREAM_5_LITE_CAPABILITY_PROFILE,
];

const SEEDREAM_4_5_CAPABILITY_PROFILE_BY_MODEL_KEY = Object.fromEntries(
  SEEDREAM_4_5_CAPABILITY_PROFILES.map((profile) => [
    profile.modelKey,
    profile,
  ]),
);

export interface CompileSeedream45GenerationBriefInput {
  brief: ImageGenerationBrief;
  modelKey: string;
}

export interface Seedream45CompileResult {
  brief: ImageGenerationBrief;
  dispatch: Seedream45Dispatch;
  evidence: GenerationBriefCompileEvidence;
}

export function compileSeedream45GenerationBrief(
  input: CompileSeedream45GenerationBriefInput,
): Seedream45CompileResult {
  const { brief, modelKey } = input;
  const profile = SEEDREAM_4_5_CAPABILITY_PROFILE_BY_MODEL_KEY[modelKey];
  if (!profile) {
    throw new GenerationBriefCompileError(
      `SeeDream 4.5 compiler received an unregistered model key: ${modelKey}.`,
      'invalid_brief',
    );
  }

  if (brief.mediaKind !== 'image') {
    throw new GenerationBriefCompileError(
      'SeeDream 4.5 compiler only supports image briefs.',
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
    SEEDREAM_4_5_MODEL_LABEL,
  );

  const { appliedConstraintFields, prompt } = buildImageGenerationBriefPrompt({
    brief,
    maxCharacters: profile.prompt.maxCharacters,
    modelLabel: SEEDREAM_4_5_MODEL_LABEL,
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

  const dispatch = seedream45DispatchSchema.parse({
    ...(imageInput.length > 0 ? { image_input: imageInput } : {}),
    prompt,
    size: profile.defaults.size,
  });

  const appliedFields = buildImageGenerationBriefAppliedFields({
    appliedConstraintFields,
    brief,
    hasSeed: false,
  });

  const evidence = buildImageGenerationBriefEvidence({
    appliedFields,
    brief,
    compilerId: SEEDREAM_4_5_IMAGE_COMPILER_ID,
    compilerVersion: SEEDREAM_4_5_IMAGE_COMPILER_VERSION,
    hasSeed: false,
    modelKey,
    numOutputs: 1,
    omitted,
    outputAspectRatio: aspectRatio,
    outputFormat: SEEDREAM_4_5_IMPLICIT_OUTPUT_FORMAT,
    profileId: profile.id,
    profileVersion: profile.version,
  });

  return { brief, dispatch, evidence };
}
