import { recordOmittedGenerationBriefSignal } from '@api/services/generation-brief/compile-image-generation-brief.util';
import { buildVideoGenerationBriefPrompt } from '@api/services/generation-brief/compile-video-generation-brief.util';
import { GenerationBriefCompileError } from '@api/services/generation-brief/generation-brief-compile.error';
import type {
  GenerationFidelityPolicy,
  VideoGenerationBrief,
} from '@genfeedai/contracts/api-types/contracts/generation-brief.contract';
import { generationFidelityPolicies } from '@genfeedai/contracts/api-types/contracts/generation-brief.contract';
import type {
  MinimaxH3CompileResult,
  MinimaxH3Dispatch,
  VideoGenerationBriefOmittedSignal,
} from '@genfeedai/contracts/api-types/contracts/video-generation-brief-compiler.contract';
import {
  MINIMAX_H3_COMPILER_ID,
  MINIMAX_H3_COMPILER_VERSION,
  minimaxH3CompileResultSchema,
  VIDEO_GENERATION_BRIEF_CONTRACT_VERSION,
} from '@genfeedai/contracts/api-types/contracts/video-generation-brief-compiler.contract';
import {
  MINIMAX_H3_CAPABILITY_PROFILE,
  MINIMAX_H3_CAPABILITY_PROFILE_ID,
  MINIMAX_H3_CAPABILITY_PROFILE_VERSION,
  MINIMAX_H3_MODEL_KEY,
} from '@genfeedai/contracts/api-types/contracts/video-generation-capability-profile.contract';
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
  referenceAudioAssetIds: string[];
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
  const referenceAudioAssetIds = [...(brief.audioReferences ?? [])];

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

    recordOmittedGenerationBriefSignal(
      omitted,
      `references.${reference.role}`,
      'MiniMax H3 supports at most one first frame, one last frame, and nine additional reference images.',
      policy,
      required,
      'MiniMax H3',
    );
  }

  return {
    firstFrameAssetId,
    lastFrameAssetId,
    referenceImageAssetIds,
    referenceVideoAssetIds,
    referenceAudioAssetIds,
  };
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

  const prompt = buildVideoGenerationBriefPrompt(input.brief, policy, omitted, {
    label: 'MiniMax H3',
    maxCharacters: MINIMAX_H3_CAPABILITY_PROFILE.prompt.maxCharacters,
  });
  const aspectRatio = resolveAspectRatio(input.brief);
  const duration = resolveDuration(input.brief);
  const resolved = resolveReferences(input.brief, policy, omitted);
  const { referenceVideoAssetIds, referenceAudioAssetIds } = resolved;
  if (resolved.lastFrameAssetId && !resolved.firstFrameAssetId) {
    throw new GenerationBriefCompileError(
      'MiniMax H3 requires a first-frame reference before a last-frame reference.',
      'invalid_brief',
    );
  }
  // The provider rejects first/last frames next to audio references (E006), so
  // with audio the frames travel as reference images instead.
  const isAudioFrameFallback =
    referenceAudioAssetIds.length > 0 &&
    (resolved.firstFrameAssetId !== undefined ||
      resolved.lastFrameAssetId !== undefined);
  const firstFrameAssetId = isAudioFrameFallback
    ? undefined
    : resolved.firstFrameAssetId;
  const lastFrameAssetId = isAudioFrameFallback
    ? undefined
    : resolved.lastFrameAssetId;
  const referenceImageAssetIds = isAudioFrameFallback
    ? [
        ...[resolved.firstFrameAssetId, resolved.lastFrameAssetId].filter(
          (assetId): assetId is string => assetId !== undefined,
        ),
        ...resolved.referenceImageAssetIds,
      ].slice(0, MAX_REFERENCE_IMAGE_URLS)
    : resolved.referenceImageAssetIds;
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
    recordOmittedGenerationBriefSignal(
      omitted,
      'seed',
      'MiniMax H3 has no native seed field.',
      policy,
      false,
      'MiniMax H3',
    );
  }

  if (
    referenceAudioAssetIds.length >
    MINIMAX_H3_CAPABILITY_PROFILE.maxAudioReferences
  ) {
    throw new GenerationBriefCompileError(
      'MiniMax H3 accepts at most three audio references.',
      'invalid_brief',
    );
  }
  if (
    referenceAudioAssetIds.length &&
    !firstFrameAssetId &&
    !lastFrameAssetId &&
    !referenceImageAssetIds.length &&
    !referenceVideoAssetIds.length
  ) {
    throw new GenerationBriefCompileError(
      'MiniMax H3 audio references require an image or video reference.',
      'invalid_brief',
    );
  }
  if (input.brief.references.length + referenceAudioAssetIds.length > 12) {
    throw new GenerationBriefCompileError(
      'MiniMax H3 accepts at most twelve reference files.',
      'invalid_brief',
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
    reference_audio_urls: referenceAudioAssetIds,
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
    ...(input.brief.intent.brandContext ? ['intent.brandContext'] : []),
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
    ...(referenceAudioAssetIds.length > 0 ? ['audioReferences'] : []),
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
    referenceAssetIds: [
      ...input.brief.references.map((reference) => reference.assetId),
      ...referenceAudioAssetIds,
    ],
    status: 'compiled' as const,
  };

  return minimaxH3CompileResultSchema.parse({
    brief: input.brief,
    dispatch,
    evidence,
  });
}
