import {
  assertRequiredImageGenerationBriefReference,
  buildImageGenerationBriefAppliedFields,
  buildImageGenerationBriefEvidence,
  buildImageGenerationBriefPrompt,
  recordExcessImageGenerationBriefReferences,
  recordUnsupportedImageGenerationBriefReferences,
  resolveImageGenerationBriefAspectRatio,
  selectImageGenerationBriefReferences,
} from '@api/services/generation-brief/compile-image-generation-brief.util';
import { GenerationBriefCompileError } from '@api/services/generation-brief/generation-brief-compile.error';
import type {
  RemainingImageFamilyDispatchSpec,
  RemainingImageGenerationBriefFamily,
} from '@api/services/generation-brief/remaining-image-generation-brief-families';
import type { ImageGenerationBrief } from '@genfeedai/contracts/api-types/contracts/generation-brief.contract';
import { generationFidelityPolicies } from '@genfeedai/contracts/api-types/contracts/generation-brief.contract';
import type {
  GenerationBriefCompileEvidence,
  GenerationBriefOmittedSignal,
  RemainingImageDispatch,
} from '@genfeedai/contracts/api-types/contracts/generation-brief-compiler.contract';
import { remainingImageDispatchSchema } from '@genfeedai/contracts/api-types/contracts/generation-brief-compiler.contract';
import type { RemainingImageCapabilityProfile } from '@genfeedai/contracts/api-types/contracts/generation-capability-profile-remaining.contract';

export interface CompileRemainingImageGenerationBriefInput {
  brief: ImageGenerationBrief;
  family: RemainingImageGenerationBriefFamily;
  modelKey: string;
  seed?: number;
}

export interface RemainingImageCompileResult {
  brief: ImageGenerationBrief;
  dispatch: RemainingImageDispatch;
  evidence: GenerationBriefCompileEvidence;
}

function profileForModelKey(
  family: RemainingImageGenerationBriefFamily,
  modelKey: string,
): RemainingImageCapabilityProfile | undefined {
  return family.profiles.find(
    (profile: RemainingImageCapabilityProfile) => profile.modelKey === modelKey,
  );
}

function assignReferenceField(
  dispatch: Record<string, boolean | number | string | string[]>,
  spec: RemainingImageFamilyDispatchSpec,
  assetIds: string[],
): void {
  if (!spec.referenceField || assetIds.length === 0) {
    return;
  }

  if (spec.referenceFieldIsArray) {
    dispatch[spec.referenceField] = assetIds;
    return;
  }

  dispatch[spec.referenceField] = assetIds[0] ?? '';
}

export function compileRemainingImageGenerationBrief(
  input: CompileRemainingImageGenerationBriefInput,
): RemainingImageCompileResult {
  const { brief, family, modelKey, seed } = input;
  const profile = profileForModelKey(family, modelKey);
  if (!profile) {
    throw new GenerationBriefCompileError(
      `${family.spec.modelLabel} compiler received an unregistered model key: ${modelKey}.`,
      'invalid_brief',
    );
  }

  if (brief.mediaKind !== 'image') {
    throw new GenerationBriefCompileError(
      `${family.spec.modelLabel} compiler only supports image briefs.`,
      'invalid_brief',
    );
  }

  const spec = family.spec;
  const policy = generationFidelityPolicies[brief.fidelityMode];
  const omitted: GenerationBriefOmittedSignal[] = [];

  if (family.requireReference) {
    assertRequiredImageGenerationBriefReference(brief, spec.modelLabel);
  }

  if (profile.references.max === 0) {
    recordUnsupportedImageGenerationBriefReferences(
      omitted,
      brief,
      policy,
      spec.modelLabel,
    );
  }

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
    spec.modelLabel,
  );

  const { appliedConstraintFields, negativePrompt, prompt } =
    buildImageGenerationBriefPrompt({
      brief,
      maxCharacters: profile.prompt.maxCharacters,
      modelLabel: spec.modelLabel,
      omitted,
      policy,
      supportsNegativePrompt: spec.negativePromptField !== undefined,
    });

  const aspectRatio = resolveImageGenerationBriefAspectRatio(
    modelKey,
    brief,
    profile.defaultAspectRatio,
  );
  const hasSeed = seed !== undefined && profile.seed.supported;

  const dispatchPayload: Record<string, boolean | number | string | string[]> =
    {
      prompt,
      ...(spec.extraDefaults ?? {}),
    };

  if (spec.aspectRatioField) {
    dispatchPayload[spec.aspectRatioField] = aspectRatio;
  }

  if (spec.negativePromptField && negativePrompt) {
    dispatchPayload[spec.negativePromptField] = negativePrompt;
  }

  if (hasSeed && seed !== undefined) {
    dispatchPayload.seed = seed;
  }

  assignReferenceField(
    dispatchPayload,
    spec,
    included.map((reference) => reference.assetId),
  );

  const dispatch = remainingImageDispatchSchema.parse(dispatchPayload);
  const appliedFields = buildImageGenerationBriefAppliedFields({
    appliedConstraintFields,
    brief,
    hasSeed,
  });

  const evidence = buildImageGenerationBriefEvidence({
    appliedFields,
    brief,
    compilerId: family.compilerId,
    compilerVersion: family.compilerVersion,
    hasSeed,
    modelKey,
    numOutputs: 1,
    omitted,
    outputAspectRatio: aspectRatio,
    outputFormat: profile.defaults.outputFormat,
    profileId: profile.id,
    profileVersion: profile.version,
    referenceAssetIds: included.map((reference) => reference.assetId),
  });

  return { brief, dispatch, evidence };
}
