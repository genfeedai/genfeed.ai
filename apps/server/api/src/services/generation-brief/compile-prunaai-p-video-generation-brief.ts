import { GenerationBriefCompileError } from '@api/services/generation-brief/generation-brief-compile.error';
import type {
  GenerationFidelityPolicy,
  VideoGenerationBrief,
} from '@genfeedai/contracts/api-types/contracts/generation-brief.contract';
import { generationFidelityPolicies } from '@genfeedai/contracts/api-types/contracts/generation-brief.contract';
import type {
  PrunaaiPVideoCompileResult,
  PrunaaiPVideoDispatch,
  VideoGenerationBriefOmittedSignal,
} from '@genfeedai/contracts/api-types/contracts/video-generation-brief-compiler.contract';
import {
  PRUNAAI_P_VIDEO_COMPILER_ID,
  PRUNAAI_P_VIDEO_COMPILER_VERSION,
  prunaaiPVideoCompileResultSchema,
  VIDEO_GENERATION_BRIEF_CONTRACT_VERSION,
} from '@genfeedai/contracts/api-types/contracts/video-generation-brief-compiler.contract';
import {
  PRUNAAI_P_VIDEO_CAPABILITY_PROFILE,
  PRUNAAI_P_VIDEO_CAPABILITY_PROFILE_ID,
  PRUNAAI_P_VIDEO_CAPABILITY_PROFILE_VERSION,
  PRUNAAI_P_VIDEO_MODEL_KEY,
} from '@genfeedai/contracts/api-types/contracts/video-generation-capability-profile.contract';
import { normalizeAspectRatioForModel } from '@genfeedai/helpers';

export interface CompilePrunaaiPVideoGenerationBriefInput {
  brief: VideoGenerationBrief;
  seed?: number;
}

function joinPromptParts(parts: string[]): string {
  return parts
    .map((part) => part.trim().replace(/\.+$/u, ''))
    .filter((part) => part.length > 0)
    .join('. ');
}

function recordOmitted(
  omitted: VideoGenerationBriefOmittedSignal[],
  field: string,
  reason: string,
  policy: GenerationFidelityPolicy,
  required: boolean,
): void {
  if (!policy.applyConstraints && !required) {
    return;
  }

  if (required && policy.unsupportedConstraintBehavior === 'reject') {
    throw new GenerationBriefCompileError(
      `PrunaAI P-Video cannot honor required ${field}.`,
      'unsupported_required_signal',
    );
  }

  omitted.push({ field, reason });
}

function resolveAspectRatio(brief: VideoGenerationBrief): string {
  const requested =
    brief.output.aspectRatio ??
    PRUNAAI_P_VIDEO_CAPABILITY_PROFILE.defaultAspectRatio;

  return normalizeAspectRatioForModel(PRUNAAI_P_VIDEO_MODEL_KEY, requested);
}

function resolveDuration(brief: VideoGenerationBrief): number {
  const { defaultSeconds, maxSeconds, minSeconds } =
    PRUNAAI_P_VIDEO_CAPABILITY_PROFILE.duration;
  const requested = brief.output.durationSeconds ?? defaultSeconds;

  return Math.round(Math.min(Math.max(requested, minSeconds), maxSeconds));
}

function resolveFirstFrameAssetId(
  brief: VideoGenerationBrief,
  policy: GenerationFidelityPolicy,
  omitted: VideoGenerationBriefOmittedSignal[],
): string | undefined {
  const required = brief.fidelityMode === 'strict';
  let firstFrameAssetId: string | undefined;

  for (const reference of brief.references) {
    if (reference.role === 'first_frame' && firstFrameAssetId === undefined) {
      firstFrameAssetId = reference.assetId;
      continue;
    }

    recordOmitted(
      omitted,
      `references.${reference.role}`,
      'PrunaAI P-Video only accepts a single first_frame reference image.',
      policy,
      required,
    );
  }

  return firstFrameAssetId;
}

function buildPrompt(
  brief: VideoGenerationBrief,
  policy: GenerationFidelityPolicy,
  omitted: VideoGenerationBriefOmittedSignal[],
): string {
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
  if (brief.intent.requestedText.length > 0) {
    parts.push(`Visible text: ${brief.intent.requestedText.join(', ')}`);
  }

  if (policy.applyConstraints) {
    for (const constraint of brief.constraints) {
      if (constraint.kind === 'desired_outcome') {
        parts.push(constraint.value);
        continue;
      }

      if (constraint.kind === 'exact_composition') {
        parts.push(constraint.value);
        continue;
      }

      recordOmitted(
        omitted,
        `constraints.${constraint.kind}`,
        'PrunaAI P-Video has no native negative-prompt field.',
        policy,
        constraint.required,
      );
    }
  }

  const prompt = joinPromptParts(parts);
  if (!prompt) {
    throw new GenerationBriefCompileError(
      'PrunaAI P-Video compilation produced an empty prompt.',
      'invalid_brief',
    );
  }

  if (prompt.length > PRUNAAI_P_VIDEO_CAPABILITY_PROFILE.prompt.maxCharacters) {
    throw new GenerationBriefCompileError(
      'PrunaAI P-Video prompt exceeds the capability profile character limit.',
      'invalid_brief',
    );
  }

  return prompt;
}

export function compilePrunaaiPVideoGenerationBrief(
  input: CompilePrunaaiPVideoGenerationBriefInput,
): PrunaaiPVideoCompileResult {
  if (input.brief.mediaKind !== 'video') {
    throw new GenerationBriefCompileError(
      'PrunaAI P-Video compilation requires a video generation brief.',
      'invalid_brief',
    );
  }

  const policy = generationFidelityPolicies[input.brief.fidelityMode];
  const omitted: VideoGenerationBriefOmittedSignal[] = [];

  const prompt = buildPrompt(input.brief, policy, omitted);
  const aspectRatio = resolveAspectRatio(input.brief);
  const duration = resolveDuration(input.brief);
  const resolution = input.brief.output.resolution ?? '720p';
  if (resolution !== '720p' && resolution !== '1080p') {
    throw new GenerationBriefCompileError(
      `PrunaAI P-Video does not support resolution "${resolution}".`,
      'invalid_brief',
    );
  }
  const firstFrameAssetId = resolveFirstFrameAssetId(
    input.brief,
    policy,
    omitted,
  );

  const dispatch: PrunaaiPVideoDispatch = {
    aspect_ratio: aspectRatio,
    duration,
    prompt,
    prompt_upsampling: true,
    resolution,
    ...(firstFrameAssetId !== undefined ? { image: firstFrameAssetId } : {}),
    ...(input.seed !== undefined ? { seed: input.seed } : {}),
  };

  const appliedFields = [
    'intent.objective',
    'output.aspectRatio',
    'output.durationSeconds',
    'output.resolution',
    ...(input.brief.intent.subjects.length > 0 ? ['intent.subjects'] : []),
    ...(input.brief.intent.scene ? ['intent.scene'] : []),
    ...(input.brief.intent.composition ? ['intent.composition'] : []),
    ...(input.brief.intent.lighting ? ['intent.lighting'] : []),
    ...(input.brief.intent.cinematography ? ['intent.cinematography'] : []),
    ...(input.brief.intent.motion ? ['intent.motion'] : []),
    ...(input.brief.intent.visualDirection ? ['intent.visualDirection'] : []),
    ...(input.brief.intent.audioDirection ? ['intent.audioDirection'] : []),
    ...(input.brief.intent.requestedText.length > 0
      ? ['intent.requestedText']
      : []),
    ...(policy.applyConstraints
      ? input.brief.constraints
          .filter((constraint) => constraint.kind !== 'avoid')
          .map((constraint) => `constraints.${constraint.kind}`)
      : []),
    ...(firstFrameAssetId !== undefined ? ['references.first_frame'] : []),
    ...(input.seed !== undefined ? ['seed'] : []),
  ];

  const evidence = {
    appliedFields,
    briefVersion: VIDEO_GENERATION_BRIEF_CONTRACT_VERSION,
    compilerId: PRUNAAI_P_VIDEO_COMPILER_ID,
    compilerVersion: PRUNAAI_P_VIDEO_COMPILER_VERSION,
    fidelityMode: input.brief.fidelityMode,
    mediaKind: 'video' as const,
    modelKey: PRUNAAI_P_VIDEO_MODEL_KEY,
    omittedSignals: omitted,
    output: {
      aspectRatio,
      durationSeconds: duration,
      hasSeed: input.seed !== undefined,
      resolution,
    },
    profileId: PRUNAAI_P_VIDEO_CAPABILITY_PROFILE_ID,
    profileVersion: PRUNAAI_P_VIDEO_CAPABILITY_PROFILE_VERSION,
    referenceAssetIds: input.brief.references.map(
      (reference) => reference.assetId,
    ),
    status: 'compiled' as const,
  };

  return prunaaiPVideoCompileResultSchema.parse({
    brief: input.brief,
    dispatch,
    evidence,
  });
}
