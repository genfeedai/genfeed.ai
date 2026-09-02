import { GenerationBriefCompileError } from '@api/services/generation-brief/generation-brief-compile.error';
import type {
  GenerationFidelityPolicy,
  VideoGenerationBrief,
} from '@api-types/contracts/generation-brief.contract';
import { generationFidelityPolicies } from '@api-types/contracts/generation-brief.contract';
import type {
  MinimaxH3CompileResult,
  MinimaxH3Dispatch,
  VideoGenerationBriefOmittedSignal,
} from '@api-types/contracts/video-generation-brief-compiler.contract';
import {
  MINIMAX_H3_COMPILER_ID,
  MINIMAX_H3_COMPILER_VERSION,
  minimaxH3CompileResultSchema,
  VIDEO_GENERATION_BRIEF_CONTRACT_VERSION,
} from '@api-types/contracts/video-generation-brief-compiler.contract';
import {
  MINIMAX_H3_CAPABILITY_PROFILE,
  MINIMAX_H3_CAPABILITY_PROFILE_ID,
  MINIMAX_H3_CAPABILITY_PROFILE_VERSION,
  MINIMAX_H3_MODEL_KEY,
} from '@api-types/contracts/video-generation-capability-profile.contract';
import { normalizeAspectRatioForModel } from '@genfeedai/helpers';

export interface CompileMinimaxH3GenerationBriefInput {
  brief: VideoGenerationBrief;
  seed?: number;
}

interface ResolvedMinimaxH3References {
  firstFrameAssetId?: string;
  lastFrameAssetId?: string;
  referenceImageAssetIds: string[];
  referenceVideoAssetIds: string[];
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
      `MiniMax H3 cannot honor required ${field}.`,
      'unsupported_required_signal',
    );
  }

  omitted.push({ field, reason });
}

function resolveAspectRatio(brief: VideoGenerationBrief): string {
  const requested =
    brief.output.aspectRatio ??
    MINIMAX_H3_CAPABILITY_PROFILE.defaultAspectRatio;

  return normalizeAspectRatioForModel(MINIMAX_H3_MODEL_KEY, requested);
}

function resolveDuration(brief: VideoGenerationBrief): number {
  const { defaultSeconds, maxSeconds, minSeconds } =
    MINIMAX_H3_CAPABILITY_PROFILE.duration;
  const requested = brief.output.durationSeconds ?? defaultSeconds;

  return Math.round(Math.min(Math.max(requested, minSeconds), maxSeconds));
}

const MAX_REFERENCE_IMAGE_URLS = 9;

function resolveReferences(
  brief: VideoGenerationBrief,
  policy: GenerationFidelityPolicy,
  omitted: VideoGenerationBriefOmittedSignal[],
): ResolvedMinimaxH3References {
  const required = brief.fidelityMode === 'strict';
  let firstFrameAssetId: string | undefined;
  let lastFrameAssetId: string | undefined;
  const referenceImageAssetIds: string[] = [];
  const referenceVideoAssetIds: string[] = [];

  for (const reference of brief.references) {
    if (reference.role === 'reference_video') {
      referenceVideoAssetIds.push(reference.assetId);
      continue;
    }

    if (reference.role === 'first_frame' && firstFrameAssetId === undefined) {
      firstFrameAssetId = reference.assetId;
      continue;
    }

    if (reference.role === 'last_frame' && lastFrameAssetId === undefined) {
      lastFrameAssetId = reference.assetId;
      continue;
    }

    if (referenceImageAssetIds.length < MAX_REFERENCE_IMAGE_URLS) {
      referenceImageAssetIds.push(reference.assetId);
      continue;
    }

    recordOmitted(
      omitted,
      `references.${reference.role}`,
      'MiniMax H3 supports at most one first frame, one last frame, and nine additional reference images.',
      policy,
      required,
    );
  }

  return {
    firstFrameAssetId,
    lastFrameAssetId,
    referenceImageAssetIds,
    referenceVideoAssetIds,
  };
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
        'MiniMax H3 has no native negative-prompt field.',
        policy,
        constraint.required,
      );
    }
  }

  const prompt = joinPromptParts(parts);
  if (!prompt) {
    throw new GenerationBriefCompileError(
      'MiniMax H3 compilation produced an empty prompt.',
      'invalid_brief',
    );
  }

  if (prompt.length > MINIMAX_H3_CAPABILITY_PROFILE.prompt.maxCharacters) {
    throw new GenerationBriefCompileError(
      'MiniMax H3 prompt exceeds the capability profile character limit.',
      'invalid_brief',
    );
  }

  return prompt;
}

export function compileMinimaxH3GenerationBrief(
  input: CompileMinimaxH3GenerationBriefInput,
): MinimaxH3CompileResult {
  if (input.brief.mediaKind !== 'video') {
    throw new GenerationBriefCompileError(
      'MiniMax H3 compilation requires a video generation brief.',
      'invalid_brief',
    );
  }

  const policy = generationFidelityPolicies[input.brief.fidelityMode];
  const omitted: VideoGenerationBriefOmittedSignal[] = [];

  const prompt = buildPrompt(input.brief, policy, omitted);
  const aspectRatio = resolveAspectRatio(input.brief);
  const duration = resolveDuration(input.brief);
  const {
    firstFrameAssetId,
    lastFrameAssetId,
    referenceImageAssetIds,
    referenceVideoAssetIds,
  } = resolveReferences(input.brief, policy, omitted);
  if (lastFrameAssetId && !firstFrameAssetId) {
    throw new GenerationBriefCompileError(
      'MiniMax H3 requires a first-frame reference before a last-frame reference.',
      'invalid_brief',
    );
  }
  if (
    referenceVideoAssetIds.length >
    MINIMAX_H3_CAPABILITY_PROFILE.maxVideoReferences
  ) {
    throw new GenerationBriefCompileError(
      `MiniMax H3 accepts at most ${MINIMAX_H3_CAPABILITY_PROFILE.maxVideoReferences} video references.`,
      'invalid_brief',
    );
  }

  if (input.seed !== undefined) {
    recordOmitted(
      omitted,
      'seed',
      'MiniMax H3 has no native seed field.',
      policy,
      false,
    );
  }

  const defaults = MINIMAX_H3_CAPABILITY_PROFILE.defaults;
  const requestedResolution = input.brief.output.resolution;
  const resolution =
    requestedResolution === '768P' || requestedResolution === '2K'
      ? requestedResolution
      : requestedResolution === undefined
        ? defaults.resolution
        : null;
  if (resolution === null) {
    throw new GenerationBriefCompileError(
      `MiniMax H3 does not support resolution "${requestedResolution}".`,
      'invalid_brief',
    );
  }

  const dispatch: MinimaxH3Dispatch = {
    duration,
    prompt,
    ratio: firstFrameAssetId !== undefined ? 'adaptive' : aspectRatio,
    reference_audio_urls: [],
    reference_image_urls: referenceImageAssetIds,
    reference_video_urls: referenceVideoAssetIds,
    resolution,
    ...(firstFrameAssetId !== undefined
      ? { first_frame_image: firstFrameAssetId }
      : {}),
    ...(lastFrameAssetId !== undefined
      ? { last_frame_image: lastFrameAssetId }
      : {}),
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
    ...(lastFrameAssetId !== undefined ? ['references.last_frame'] : []),
    ...(referenceImageAssetIds.length > 0 ? ['references.additional'] : []),
    ...(referenceVideoAssetIds.length > 0
      ? ['references.reference_video']
      : []),
  ];

  const evidence = {
    appliedFields,
    briefVersion: VIDEO_GENERATION_BRIEF_CONTRACT_VERSION,
    compilerId: MINIMAX_H3_COMPILER_ID,
    compilerVersion: MINIMAX_H3_COMPILER_VERSION,
    fidelityMode: input.brief.fidelityMode,
    mediaKind: 'video' as const,
    modelKey: MINIMAX_H3_MODEL_KEY,
    omittedSignals: omitted,
    output: {
      aspectRatio,
      durationSeconds: duration,
      hasSeed: false,
      resolution,
    },
    profileId: MINIMAX_H3_CAPABILITY_PROFILE_ID,
    profileVersion: MINIMAX_H3_CAPABILITY_PROFILE_VERSION,
    referenceAssetIds: input.brief.references.map(
      (reference) => reference.assetId,
    ),
    status: 'compiled' as const,
  };

  return minimaxH3CompileResultSchema.parse({
    brief: input.brief,
    dispatch,
    evidence,
  });
}
