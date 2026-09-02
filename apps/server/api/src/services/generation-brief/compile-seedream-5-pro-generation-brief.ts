/**
 * Compiles a canonical image generation brief into a ByteDance SeeDream 5 Pro
 * dispatch payload.
 *
 * Unlike SeeDream 4 / 4.5, SeeDream 5 Pro's dispatch schema carries an
 * *optional* `output_format` field, and the capability profile's `defaults`
 * schema mirrors that optionality. When a profile eventually sets
 * `defaults.outputFormat`, this compiler spreads it into dispatch and uses it
 * as evidence directly. Today's parsed profile constant never sets it, so
 * this compiler falls back to a documented implicit format (matching the
 * SeeDream 4 / 4.5 workaround) solely to satisfy the mandatory
 * `output.outputFormat` evidence field -- the fallback is never spread into
 * dispatch, only the real (currently absent) profile value would be.
 *
 * SeeDream 5 Pro's capability profile also declares `resolution.supported:
 * true`, but the dispatch schema has no dispatch-side `resolution` field --
 * only a `size` tier sourced from `defaults.size`. There is no brief-carried
 * resolution-tier value to map onto a dispatch field that does not exist, so
 * -- like the Nano Banana 2 family's resolution simplification -- this
 * compiler never invents one.
 *
 * Neither dispatch nor the profile carries an `aspect_ratio` field; the
 * resolved aspect ratio still feeds evidence via
 * {@link resolveImageGenerationBriefAspectRatio}. Up to 10 references map
 * onto the native `image_input` array; anything beyond that is recorded as an
 * omitted signal.
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
  Seedream5ProDispatch,
} from '@genfeedai/contracts/api-types/contracts/generation-brief-compiler.contract';
import {
  SEEDREAM_5_PRO_IMAGE_COMPILER_ID,
  SEEDREAM_5_PRO_IMAGE_COMPILER_VERSION,
  seedream5ProDispatchSchema,
} from '@genfeedai/contracts/api-types/contracts/generation-brief-compiler.contract';
import { SEEDREAM_5_PRO_CAPABILITY_PROFILE } from '@genfeedai/contracts/api-types/contracts/generation-capability-profile.contract';

const SEEDREAM_5_PRO_IMPLICIT_OUTPUT_FORMAT = 'png';
const SEEDREAM_5_PRO_MODEL_LABEL = 'SeeDream 5 Pro';

export interface CompileSeedream5ProGenerationBriefInput {
  brief: ImageGenerationBrief;
  modelKey: string;
}

export interface Seedream5ProCompileResult {
  brief: ImageGenerationBrief;
  dispatch: Seedream5ProDispatch;
  evidence: GenerationBriefCompileEvidence;
}

export function compileSeedream5ProGenerationBrief(
  input: CompileSeedream5ProGenerationBriefInput,
): Seedream5ProCompileResult {
  const { brief, modelKey } = input;
  const profile = SEEDREAM_5_PRO_CAPABILITY_PROFILE;
  if (modelKey !== profile.modelKey) {
    throw new GenerationBriefCompileError(
      `SeeDream 5 Pro compiler received an unregistered model key: ${modelKey}.`,
      'invalid_brief',
    );
  }

  if (brief.mediaKind !== 'image') {
    throw new GenerationBriefCompileError(
      'SeeDream 5 Pro compiler only supports image briefs.',
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
    SEEDREAM_5_PRO_MODEL_LABEL,
  );

  const { appliedConstraintFields, prompt } = buildImageGenerationBriefPrompt({
    brief,
    maxCharacters: profile.prompt.maxCharacters,
    modelLabel: SEEDREAM_5_PRO_MODEL_LABEL,
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
  const outputFormat =
    profile.defaults.outputFormat ?? SEEDREAM_5_PRO_IMPLICIT_OUTPUT_FORMAT;

  const dispatch = seedream5ProDispatchSchema.parse({
    ...(imageInput.length > 0 ? { image_input: imageInput } : {}),
    ...(profile.defaults.outputFormat
      ? { output_format: profile.defaults.outputFormat }
      : {}),
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
    compilerId: SEEDREAM_5_PRO_IMAGE_COMPILER_ID,
    compilerVersion: SEEDREAM_5_PRO_IMAGE_COMPILER_VERSION,
    hasSeed: false,
    modelKey,
    numOutputs: 1,
    omitted,
    outputAspectRatio: aspectRatio,
    outputFormat,
    profileId: profile.id,
    profileVersion: profile.version,
  });

  return { brief, dispatch, evidence };
}
