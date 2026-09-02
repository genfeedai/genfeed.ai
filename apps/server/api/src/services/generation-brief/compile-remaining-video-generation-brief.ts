import {
  joinGenerationBriefPromptParts,
  recordOmittedGenerationBriefSignal,
} from '@api/services/generation-brief/compile-image-generation-brief.util';
import { GenerationBriefCompileError } from '@api/services/generation-brief/generation-brief-compile.error';
import type { RemainingVideoGenerationBriefFamily } from '@api/services/generation-brief/remaining-video-generation-brief-families';
import type { VideoGenerationBrief } from '@genfeedai/contracts/api-types/contracts/generation-brief.contract';
import { generationFidelityPolicies } from '@genfeedai/contracts/api-types/contracts/generation-brief.contract';
import type {
  RemainingVideoDispatch,
  VideoGenerationBriefOmittedSignal,
} from '@genfeedai/contracts/api-types/contracts/video-generation-brief-compiler.contract';
import {
  remainingVideoCompileEvidenceSchema,
  remainingVideoDispatchSchema,
  VIDEO_GENERATION_BRIEF_CONTRACT_VERSION,
} from '@genfeedai/contracts/api-types/contracts/video-generation-brief-compiler.contract';
import type { RemainingVideoCapabilityProfile } from '@genfeedai/contracts/api-types/contracts/video-generation-capability-profile-remaining.contract';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';
import { normalizeAspectRatioForModel } from '@genfeedai/helpers';
import { getVideoResolutionsByModel } from '@genfeedai/helpers/media/video-resolution/video-resolution.helper';

export interface CompileRemainingVideoGenerationBriefInput {
  brief: VideoGenerationBrief;
  family: RemainingVideoGenerationBriefFamily;
  modelKey: string;
  seed?: number;
}

function profileForModelKey(
  family: RemainingVideoGenerationBriefFamily,
  modelKey: string,
): RemainingVideoCapabilityProfile | undefined {
  return family.profiles.find(
    (profile: RemainingVideoCapabilityProfile) => profile.modelKey === modelKey,
  );
}

function resolveDuration(
  brief: VideoGenerationBrief,
  profile: RemainingVideoCapabilityProfile,
): number {
  const { defaultSeconds, maxSeconds, minSeconds } = profile.duration;
  const requested = brief.output.durationSeconds ?? defaultSeconds;
  return Math.round(Math.min(Math.max(requested, minSeconds), maxSeconds));
}

function requiresFirstFrame(
  family: RemainingVideoGenerationBriefFamily,
  profile: RemainingVideoCapabilityProfile,
): boolean {
  return (
    family.requireFirstFrame === true ||
    (profile.generationModes.length === 1 &&
      profile.generationModes[0] === 'image_to_video')
  );
}

export function compileRemainingVideoGenerationBrief(
  input: CompileRemainingVideoGenerationBriefInput,
): {
  brief: VideoGenerationBrief;
  dispatch: RemainingVideoDispatch;
  evidence: ReturnType<typeof remainingVideoCompileEvidenceSchema.parse>;
} {
  const { brief, family, modelKey, seed } = input;
  const profile = profileForModelKey(family, modelKey);
  if (!profile) {
    throw new GenerationBriefCompileError(
      `${family.spec.modelLabel} compiler received an unregistered model key: ${modelKey}.`,
      'invalid_brief',
    );
  }

  if (brief.mediaKind !== 'video') {
    throw new GenerationBriefCompileError(
      `${family.spec.modelLabel} compiler only supports video briefs.`,
      'invalid_brief',
    );
  }

  const spec = family.spec;
  const policy = generationFidelityPolicies[brief.fidelityMode];
  const omitted: VideoGenerationBriefOmittedSignal[] = [];
  const required = brief.fidelityMode === 'strict';

  let firstFrameAssetId: string | undefined;
  let lastFrameAssetId: string | undefined;
  const extraReferenceAssetIds: string[] = [];
  const videoReferenceAssetIds: string[] = [];
  const supportsFirstFrame = profile.references.roles.includes('first_frame');

  for (const reference of brief.references) {
    if (reference.role === 'reference_video') {
      if (
        spec.videoReferenceField &&
        profile.references.nativeFields.includes(spec.videoReferenceField)
      ) {
        videoReferenceAssetIds.push(reference.assetId);
        continue;
      }
      recordOmittedGenerationBriefSignal(
        omitted,
        'references.reference_video',
        `${spec.modelLabel} cannot honor video references.`,
        policy,
        required,
        spec.modelLabel,
      );
      continue;
    }
    if (!profile.references.roles.includes(reference.role)) {
      recordOmittedGenerationBriefSignal(
        omitted,
        `references.${reference.role}`,
        `${spec.modelLabel} does not support ${reference.role} references for ${profile.modelKey}.`,
        policy,
        required,
        spec.modelLabel,
      );
      continue;
    }
    if (
      (reference.role === 'first_frame' ||
        (reference.role === 'subject' && supportsFirstFrame)) &&
      firstFrameAssetId === undefined
    ) {
      firstFrameAssetId = reference.assetId;
      continue;
    }
    if (
      reference.role === 'last_frame' &&
      lastFrameAssetId === undefined &&
      spec.lastFrameField &&
      profile.references.nativeFields.includes(spec.lastFrameField)
    ) {
      lastFrameAssetId = reference.assetId;
      continue;
    }
    if (
      spec.extraReferenceField &&
      profile.references.nativeFields.includes(spec.extraReferenceField)
    ) {
      extraReferenceAssetIds.push(reference.assetId);
      continue;
    }
    recordOmittedGenerationBriefSignal(
      omitted,
      `references.${reference.role}`,
      `${spec.modelLabel} cannot honor additional ${reference.role} references.`,
      policy,
      required,
      spec.modelLabel,
    );
  }

  if (lastFrameAssetId && !firstFrameAssetId) {
    throw new GenerationBriefCompileError(
      `${spec.modelLabel} requires a first-frame reference before a last-frame reference.`,
      'invalid_brief',
    );
  }

  const imageReferenceCount =
    modelKey === MODEL_KEYS.FAL_GOOGLE_GEMINI_OMNI_FLASH
      ? Number(firstFrameAssetId !== undefined) + extraReferenceAssetIds.length
      : extraReferenceAssetIds.length;
  const maxImageReferences =
    modelKey === MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V3_OMNI_VIDEO &&
    videoReferenceAssetIds.length > 0
      ? 4
      : profile.references.max;
  if (imageReferenceCount > maxImageReferences) {
    throw new GenerationBriefCompileError(
      `${spec.modelLabel} accepts at most ${maxImageReferences} image references.`,
      'invalid_brief',
    );
  }

  const maxVideoReferences =
    profile.maxVideoReferences ?? profile.references.max;
  if (videoReferenceAssetIds.length > maxVideoReferences) {
    throw new GenerationBriefCompileError(
      `${spec.modelLabel} accepts at most ${maxVideoReferences} video references.`,
      'invalid_brief',
    );
  }

  if (requiresFirstFrame(family, profile) && !firstFrameAssetId) {
    throw new GenerationBriefCompileError(
      `${spec.modelLabel} requires a first-frame reference image.`,
      'unsupported_required_signal',
    );
  }

  const parts: string[] = [brief.intent.objective];
  if (brief.intent.subjects.length > 0) {
    parts.push(brief.intent.subjects.join(', '));
  }
  if (brief.intent.scene) {
    parts.push(brief.intent.scene);
  }
  if (brief.intent.composition) {
    parts.push(brief.intent.composition);
  }
  if (brief.intent.lighting) {
    parts.push(brief.intent.lighting);
  }
  if (brief.intent.cinematography) {
    parts.push(brief.intent.cinematography);
  }
  if (brief.intent.motion) {
    parts.push(brief.intent.motion);
  }
  if (brief.intent.visualDirection) {
    parts.push(brief.intent.visualDirection);
  }
  if (brief.intent.audioDirection) {
    parts.push(`Audio: ${brief.intent.audioDirection}`);
  }

  const negativeParts: string[] = [];
  if (policy.applyConstraints) {
    for (const constraint of brief.constraints) {
      if (
        constraint.kind === 'desired_outcome' ||
        constraint.kind === 'exact_composition'
      ) {
        parts.push(constraint.value);
        continue;
      }
      if (spec.negativePromptField) {
        negativeParts.push(constraint.value);
        continue;
      }
      recordOmittedGenerationBriefSignal(
        omitted,
        `constraints.${constraint.kind}`,
        `${spec.modelLabel} has no native negative-prompt field.`,
        policy,
        constraint.required,
        spec.modelLabel,
      );
    }
  }

  const prompt = joinGenerationBriefPromptParts(parts);
  if (!prompt) {
    throw new GenerationBriefCompileError(
      `${spec.modelLabel} compilation produced an empty prompt.`,
      'invalid_brief',
    );
  }

  const aspectRatio = normalizeAspectRatioForModel(
    modelKey,
    brief.output.aspectRatio ?? profile.defaultAspectRatio,
  );
  const duration = resolveDuration(brief, profile);
  const hasSeed = seed !== undefined && profile.seed.supported;
  const resolutionOptions = getVideoResolutionsByModel(modelKey);
  const requestedResolution = brief.output.resolution;
  const resolution = requestedResolution ?? profile.defaults.resolution;
  if (
    requestedResolution &&
    !resolutionOptions.some((option) => option.value === requestedResolution)
  ) {
    throw new GenerationBriefCompileError(
      `${spec.modelLabel} does not support resolution "${requestedResolution}" for model "${modelKey}".`,
      'invalid_brief',
    );
  }
  if (
    modelKey === MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V3_OMNI_VIDEO &&
    resolution === '4k' &&
    videoReferenceAssetIds.length > 0
  ) {
    throw new GenerationBriefCompileError(
      'Kling v3 Omni does not support video references in 4K mode.',
      'invalid_brief',
    );
  }
  if (
    modelKey === MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_5 &&
    videoReferenceAssetIds.length > 0 &&
    (firstFrameAssetId || lastFrameAssetId)
  ) {
    throw new GenerationBriefCompileError(
      'Seedance 2.5 cannot combine first or last frames with video references.',
      'invalid_brief',
    );
  }

  const dispatchPayload: Record<string, boolean | number | string | string[]> =
    {
      prompt,
      ...(spec.extraDefaults ?? {}),
    };

  if (spec.aspectRatioField) {
    dispatchPayload[spec.aspectRatioField] =
      modelKey === MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_5 &&
      firstFrameAssetId &&
      lastFrameAssetId
        ? 'adaptive'
        : aspectRatio;
  }
  if (spec.durationField) {
    dispatchPayload[spec.durationField] = duration;
  }
  if (spec.negativePromptField && negativeParts.length > 0) {
    dispatchPayload[spec.negativePromptField] =
      joinGenerationBriefPromptParts(negativeParts);
  }
  if (hasSeed && seed !== undefined) {
    dispatchPayload.seed = seed;
  }
  if (spec.resolutionField && resolution) {
    dispatchPayload[spec.resolutionField] = resolution;
  }
  if (spec.firstFrameField && firstFrameAssetId) {
    dispatchPayload[spec.firstFrameField] = firstFrameAssetId;
  }
  if (spec.lastFrameField && lastFrameAssetId) {
    dispatchPayload[spec.lastFrameField] = lastFrameAssetId;
  }
  if (spec.extraReferenceField && extraReferenceAssetIds.length > 0) {
    dispatchPayload[spec.extraReferenceField] = extraReferenceAssetIds;
  }
  if (spec.videoReferenceField && videoReferenceAssetIds.length > 0) {
    dispatchPayload[spec.videoReferenceField] =
      spec.videoReferenceField === 'reference_video'
        ? videoReferenceAssetIds[0]
        : videoReferenceAssetIds;
  }

  const dispatch = remainingVideoDispatchSchema.parse(dispatchPayload);
  const evidence = remainingVideoCompileEvidenceSchema.parse({
    appliedFields: [
      'intent.objective',
      'output.aspectRatio',
      'output.durationSeconds',
      ...(brief.intent.subjects.length > 0 ? ['intent.subjects'] : []),
      ...(brief.intent.scene ? ['intent.scene'] : []),
      ...(brief.intent.composition ? ['intent.composition'] : []),
      ...(brief.intent.lighting ? ['intent.lighting'] : []),
      ...(brief.intent.cinematography ? ['intent.cinematography'] : []),
      ...(brief.intent.motion ? ['intent.motion'] : []),
      ...(brief.intent.visualDirection ? ['intent.visualDirection'] : []),
      ...(brief.intent.audioDirection ? ['intent.audioDirection'] : []),
      ...(firstFrameAssetId ? ['references.first_frame'] : []),
      ...(lastFrameAssetId ? ['references.last_frame'] : []),
      ...(resolution ? ['output.resolution'] : []),
      ...(videoReferenceAssetIds.length > 0
        ? ['references.reference_video']
        : []),
    ],
    briefVersion: VIDEO_GENERATION_BRIEF_CONTRACT_VERSION,
    compilerId: family.compilerId,
    compilerVersion: family.compilerVersion,
    fidelityMode: brief.fidelityMode,
    mediaKind: 'video',
    modelKey,
    omittedSignals: omitted,
    output: {
      aspectRatio,
      durationSeconds: duration,
      hasSeed,
      ...(resolution ? { resolution } : {}),
    },
    profileId: profile.id,
    profileVersion: profile.version,
    referenceAssetIds: brief.references.map((reference) => reference.assetId),
    status: 'compiled',
  });

  return { brief, dispatch, evidence };
}
