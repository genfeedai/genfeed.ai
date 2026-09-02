/**
 * Compiler identity, redacted evidence, and dispatch contracts for the video
 * generation-brief path.
 *
 * Mirrors generation-brief-compiler.contract.ts (image, FLUX Schnell only) as its own file:
 * two model families are selectable here (PrunaAI P-Video and MiniMax H3), and both naturally
 * reuse the same `kind: 'compile'` / `status: 'compiled'` discriminant, so `z.union` replaces
 * `z.discriminatedUnion` — every branch stays `.strict()` with disjoint compilerId/modelKey/
 * profileId literals, which is sufficient for Zod to resolve them unambiguously.
 *
 * `VIDEO_GENERATION_BRIEF_CONTRACT_VERSION` is defined independently of the image path's
 * `GENERATION_BRIEF_CONTRACT_VERSION` so the two lanes never share a version constant.
 *
 * Compilation must not mutate the normalized brief. Persisted evidence records
 * compiler/profile identity and omitted-signal kinds only — never prompt text,
 * credentials, or signed URLs.
 *
 * First video compilers are PrunaAI P-Video and MiniMax H3 (#3468) under parent #1650.
 */

import { z } from 'zod';
import {
  generationFidelityModeSchema,
  videoGenerationBriefSchema,
} from './generation-brief.contract';
import {
  generationBriefExemptionReasonSchema,
  generationBriefOmittedSignalSchema,
  generationBriefSurfaceSchema,
} from './generation-brief-compiler.contract';
import {
  MINIMAX_H3_CAPABILITY_PROFILE_ID,
  MINIMAX_H3_CAPABILITY_PROFILE_VERSION,
  MINIMAX_H3_MODEL_KEY,
  PRUNAAI_P_VIDEO_CAPABILITY_PROFILE_ID,
  PRUNAAI_P_VIDEO_CAPABILITY_PROFILE_VERSION,
  PRUNAAI_P_VIDEO_MODEL_KEY,
} from './video-generation-capability-profile.contract';

export const VIDEO_GENERATION_BRIEF_CONTRACT_VERSION = 1;

export const PRUNAAI_P_VIDEO_COMPILER_ID = 'prunaai-p-video-compiler';
export const PRUNAAI_P_VIDEO_COMPILER_VERSION = 1;
export const MINIMAX_H3_COMPILER_ID = 'minimax-h3-compiler';
export const MINIMAX_H3_COMPILER_VERSION = 2;

export {
  generationBriefExemptionReasonSchema as videoGenerationBriefExemptionReasonSchema,
  generationBriefSurfaceSchema as videoGenerationBriefSurfaceSchema,
};

const aspectRatioSchema = z.string().regex(/^[1-9]\d{0,3}:[1-9]\d{0,3}$/);
const videoActionVerbSchema = z.enum([
  'generate',
  'interpolate',
  'reference_video',
  'extend',
  'upscale',
]);
const videoDispatchModeSchema = z.enum(['native', 'fabricated']);

// ---------------------------------------------------------------------------
// Support (compiler resolution)
// ---------------------------------------------------------------------------

export const prunaaiPVideoCompileSupportSchema = z
  .object({
    compilerId: z.literal(PRUNAAI_P_VIDEO_COMPILER_ID),
    compilerVersion: z.literal(PRUNAAI_P_VIDEO_COMPILER_VERSION),
    kind: z.literal('compile'),
    modelKey: z.literal(PRUNAAI_P_VIDEO_MODEL_KEY),
    profileId: z.literal(PRUNAAI_P_VIDEO_CAPABILITY_PROFILE_ID),
    profileVersion: z.literal(PRUNAAI_P_VIDEO_CAPABILITY_PROFILE_VERSION),
  })
  .strict();

export const minimaxH3CompileSupportSchema = z
  .object({
    compilerId: z.literal(MINIMAX_H3_COMPILER_ID),
    compilerVersion: z.literal(MINIMAX_H3_COMPILER_VERSION),
    kind: z.literal('compile'),
    modelKey: z.literal(MINIMAX_H3_MODEL_KEY),
    profileId: z.literal(MINIMAX_H3_CAPABILITY_PROFILE_ID),
    profileVersion: z.literal(MINIMAX_H3_CAPABILITY_PROFILE_VERSION),
  })
  .strict();

export const videoGenerationBriefExemptSupportSchema = z
  .object({
    compilerId: z.null(),
    kind: z.literal('exempt'),
    modelKey: z.string().trim().min(1).max(255),
    profileId: z.null(),
    reason: generationBriefExemptionReasonSchema,
  })
  .strict();

export const remainingVideoCompileSupportSchema = z
  .object({
    compilerId: z.string().trim().min(1).max(255),
    compilerVersion: z.number().int().positive(),
    kind: z.literal('compile'),
    modelKey: z.string().trim().min(1).max(255),
    profileId: z.string().trim().min(1).max(255),
    profileVersion: z.number().int().positive(),
  })
  .strict();

export const videoGenerationBriefSupportSchema = z.union([
  prunaaiPVideoCompileSupportSchema,
  minimaxH3CompileSupportSchema,
  remainingVideoCompileSupportSchema,
  videoGenerationBriefExemptSupportSchema,
]);

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

export const videoGenerationBriefCompileEvidenceOutputSchema = z
  .object({
    aspectRatio: aspectRatioSchema,
    durationSeconds: z.number().positive().max(300),
    hasSeed: z.boolean(),
    resolution: z.string().trim().min(1).max(32).optional(),
  })
  .strict();

export const prunaaiPVideoCompileEvidenceSchema = z
  .object({
    actionVerb: videoActionVerbSchema.optional(),
    appliedFields: z.array(z.string().trim().min(1).max(255)).max(50),
    briefVersion: z.literal(VIDEO_GENERATION_BRIEF_CONTRACT_VERSION),
    compilerId: z.literal(PRUNAAI_P_VIDEO_COMPILER_ID),
    compilerVersion: z.literal(PRUNAAI_P_VIDEO_COMPILER_VERSION),
    dispatchMode: videoDispatchModeSchema.optional(),
    fidelityMode: generationFidelityModeSchema,
    mediaKind: z.literal('video'),
    modelKey: z.literal(PRUNAAI_P_VIDEO_MODEL_KEY),
    omittedSignals: z.array(generationBriefOmittedSignalSchema).max(50),
    output: videoGenerationBriefCompileEvidenceOutputSchema,
    profileId: z.literal(PRUNAAI_P_VIDEO_CAPABILITY_PROFILE_ID),
    profileVersion: z.literal(PRUNAAI_P_VIDEO_CAPABILITY_PROFILE_VERSION),
    referenceAssetIds: z.array(z.string().trim().min(1).max(255)).max(20),
    status: z.literal('compiled'),
    surface: generationBriefSurfaceSchema.optional(),
  })
  .strict();

export const minimaxH3CompileEvidenceSchema = z
  .object({
    actionVerb: videoActionVerbSchema.optional(),
    appliedFields: z.array(z.string().trim().min(1).max(255)).max(50),
    briefVersion: z.literal(VIDEO_GENERATION_BRIEF_CONTRACT_VERSION),
    compilerId: z.literal(MINIMAX_H3_COMPILER_ID),
    compilerVersion: z.literal(MINIMAX_H3_COMPILER_VERSION),
    dispatchMode: videoDispatchModeSchema.optional(),
    fidelityMode: generationFidelityModeSchema,
    mediaKind: z.literal('video'),
    modelKey: z.literal(MINIMAX_H3_MODEL_KEY),
    omittedSignals: z.array(generationBriefOmittedSignalSchema).max(50),
    output: videoGenerationBriefCompileEvidenceOutputSchema,
    profileId: z.literal(MINIMAX_H3_CAPABILITY_PROFILE_ID),
    profileVersion: z.literal(MINIMAX_H3_CAPABILITY_PROFILE_VERSION),
    referenceAssetIds: z.array(z.string().trim().min(1).max(255)).max(20),
    status: z.literal('compiled'),
    surface: generationBriefSurfaceSchema.optional(),
  })
  .strict();

export const videoGenerationBriefExemptionEvidenceSchema = z
  .object({
    actionVerb: videoActionVerbSchema.optional(),
    compilerId: z.null(),
    compilerVersion: z.null(),
    dispatchMode: videoDispatchModeSchema.optional(),
    modelKey: z.string().trim().min(1).max(255),
    profileId: z.null(),
    profileVersion: z.null(),
    reason: generationBriefExemptionReasonSchema,
    status: z.literal('exempted'),
    surface: generationBriefSurfaceSchema.optional(),
  })
  .strict();

export const remainingVideoCompileEvidenceSchema = z
  .object({
    actionVerb: videoActionVerbSchema.optional(),
    appliedFields: z.array(z.string().trim().min(1).max(255)).max(50),
    briefVersion: z.literal(VIDEO_GENERATION_BRIEF_CONTRACT_VERSION),
    compilerId: z.string().trim().min(1).max(255),
    compilerVersion: z.number().int().positive(),
    dispatchMode: videoDispatchModeSchema.optional(),
    fidelityMode: generationFidelityModeSchema,
    mediaKind: z.literal('video'),
    modelKey: z.string().trim().min(1).max(255),
    omittedSignals: z.array(generationBriefOmittedSignalSchema).max(50),
    output: videoGenerationBriefCompileEvidenceOutputSchema,
    profileId: z.string().trim().min(1).max(255),
    profileVersion: z.number().int().positive(),
    referenceAssetIds: z.array(z.string().trim().min(1).max(255)).max(20),
    status: z.literal('compiled'),
    surface: generationBriefSurfaceSchema.optional(),
  })
  .strict();

export const videoGenerationBriefPersistedEvidenceSchema = z.union([
  prunaaiPVideoCompileEvidenceSchema,
  minimaxH3CompileEvidenceSchema,
  remainingVideoCompileEvidenceSchema,
  videoGenerationBriefExemptionEvidenceSchema,
]);

export const remainingVideoDispatchSchema = z
  .object({
    prompt: z.string().trim().min(1).max(10_000),
  })
  .catchall(
    z.union([
      z.string(),
      z.number(),
      z.boolean(),
      z.array(z.string().trim().min(1).max(2_048)),
    ]),
  );
export type RemainingVideoDispatch = z.infer<
  typeof remainingVideoDispatchSchema
>;

export const REMAINING_VIDEO_COMPILER_VERSION = 2;
export const VEO_VIDEO_COMPILER_ID = 'veo-video-compiler';
export const SORA_VIDEO_COMPILER_ID = 'sora-video-compiler';
export const KLING_VIDEO_COMPILER_ID = 'kling-video-compiler';
export const WAN_VIDEO_COMPILER_ID = 'wan-video-compiler';
export const SEEDANCE_VIDEO_COMPILER_ID = 'seedance-video-compiler';
export const HAILUO_VIDEO_COMPILER_ID = 'hailuo-video-compiler';
export const VIDU_VIDEO_COMPILER_ID = 'vidu-video-compiler';
export const PIXVERSE_VIDEO_COMPILER_ID = 'pixverse-video-compiler';
export const GROK_IMAGINE_VIDEO_COMPILER_ID = 'grok-imagine-video-compiler';
export const RUNWAY_VIDEO_COMPILER_ID = 'runway-video-compiler';
export const LUMA_VIDEO_COMPILER_ID = 'luma-video-compiler';
export const FAL_STABLE_VIDEO_COMPILER_ID = 'fal-stable-video-compiler';
export const GEMINI_OMNI_VIDEO_COMPILER_ID = 'gemini-omni-video-compiler';
export const H3_MAX_VIDEO_COMPILER_ID = 'h3-max-video-compiler';

// ---------------------------------------------------------------------------
// Dispatch shapes
// ---------------------------------------------------------------------------

export const prunaaiPVideoDispatchSchema = z
  .object({
    aspect_ratio: aspectRatioSchema,
    duration: z.number().int().positive().max(300),
    image: z.string().trim().min(1).max(2_048).optional(),
    prompt: z.string().trim().min(1).max(10_000),
    prompt_upsampling: z.literal(true),
    resolution: z.enum(['720p', '1080p']),
    seed: z.number().int().optional(),
  })
  .strict();

export const minimaxH3DispatchSchema = z
  .object({
    duration: z.number().int().positive().max(300),
    first_frame_image: z.string().trim().min(1).max(2_048).optional(),
    last_frame_image: z.string().trim().min(1).max(2_048).optional(),
    prompt: z.string().trim().min(1).max(10_000),
    ratio: z.string().trim().min(1).max(32),
    reference_audio_urls: z.array(z.string().trim().min(1).max(2_048)).max(10),
    reference_image_urls: z.array(z.string().trim().min(1).max(2_048)).max(9),
    reference_video_urls: z.array(z.string().trim().min(1).max(2_048)).max(10),
    resolution: z.enum(['768P', '2K']),
  })
  .strict();

export const prunaaiPVideoCompileResultSchema = z
  .object({
    brief: videoGenerationBriefSchema,
    dispatch: prunaaiPVideoDispatchSchema,
    evidence: prunaaiPVideoCompileEvidenceSchema,
  })
  .strict();

export const minimaxH3CompileResultSchema = z
  .object({
    brief: videoGenerationBriefSchema,
    dispatch: minimaxH3DispatchSchema,
    evidence: minimaxH3CompileEvidenceSchema,
  })
  .strict();

export type VideoGenerationBriefSupport = z.infer<
  typeof videoGenerationBriefSupportSchema
>;
export type VideoGenerationBriefOmittedSignal = z.infer<
  typeof generationBriefOmittedSignalSchema
>;
export type VideoGenerationBriefCompileEvidenceOutput = z.infer<
  typeof videoGenerationBriefCompileEvidenceOutputSchema
>;
export type PrunaaiPVideoCompileEvidence = z.infer<
  typeof prunaaiPVideoCompileEvidenceSchema
>;
export type MinimaxH3CompileEvidence = z.infer<
  typeof minimaxH3CompileEvidenceSchema
>;
export type VideoGenerationBriefExemptionEvidence = z.infer<
  typeof videoGenerationBriefExemptionEvidenceSchema
>;
export type VideoGenerationBriefPersistedEvidence = z.infer<
  typeof videoGenerationBriefPersistedEvidenceSchema
>;
export type PrunaaiPVideoDispatch = z.infer<typeof prunaaiPVideoDispatchSchema>;
export type MinimaxH3Dispatch = z.infer<typeof minimaxH3DispatchSchema>;
export type PrunaaiPVideoCompileResult = z.infer<
  typeof prunaaiPVideoCompileResultSchema
>;
export type MinimaxH3CompileResult = z.infer<
  typeof minimaxH3CompileResultSchema
>;

export function buildPrunaaiPVideoGenerationSource(): string {
  return [
    'generation-brief',
    `v${VIDEO_GENERATION_BRIEF_CONTRACT_VERSION}`,
    `${PRUNAAI_P_VIDEO_CAPABILITY_PROFILE_ID}@${PRUNAAI_P_VIDEO_CAPABILITY_PROFILE_VERSION}`,
    `${PRUNAAI_P_VIDEO_COMPILER_ID}@${PRUNAAI_P_VIDEO_COMPILER_VERSION}`,
  ].join(':');
}

export function buildMinimaxH3GenerationSource(): string {
  return [
    'generation-brief',
    `v${VIDEO_GENERATION_BRIEF_CONTRACT_VERSION}`,
    `${MINIMAX_H3_CAPABILITY_PROFILE_ID}@${MINIMAX_H3_CAPABILITY_PROFILE_VERSION}`,
    `${MINIMAX_H3_COMPILER_ID}@${MINIMAX_H3_COMPILER_VERSION}`,
  ].join(':');
}

export function buildVideoGenerationBriefExemptionSource(
  reason: z.infer<typeof generationBriefExemptionReasonSchema>,
): string {
  return `generation-brief-exemption:${reason}`;
}
