/**
 * Phase 2 leftover (#1650): every selectable video model key maps to a
 * compiler + profile or an enumerated exemption. Unknown keys resolve to
 * `unregistered_model` rather than a catch-all legacy prompt builder.
 */

import { compileMinimaxH3GenerationBrief } from '@api/services/generation-brief/compile-minimax-h3-generation-brief';
import { compilePrunaaiPVideoGenerationBrief } from '@api/services/generation-brief/compile-prunaai-p-video-generation-brief';
import { compileRemainingVideoGenerationBrief } from '@api/services/generation-brief/compile-remaining-video-generation-brief';
import { REMAINING_VIDEO_GENERATION_BRIEF_FAMILIES } from '@api/services/generation-brief/remaining-video-generation-brief-families';
import type { VideoGenerationBrief } from '@genfeedai/contracts/api-types/contracts/generation-brief.contract';
import type { GenerationBriefExemptionReason } from '@genfeedai/contracts/api-types/contracts/generation-brief-compiler.contract';
import type { VideoGenerationBriefPersistedEvidence } from '@genfeedai/contracts/api-types/contracts/video-generation-brief-compiler.contract';
import {
  MINIMAX_H3_COMPILER_ID,
  MINIMAX_H3_COMPILER_VERSION,
  PRUNAAI_P_VIDEO_COMPILER_ID,
  PRUNAAI_P_VIDEO_COMPILER_VERSION,
} from '@genfeedai/contracts/api-types/contracts/video-generation-brief-compiler.contract';
import {
  MINIMAX_H3_CAPABILITY_PROFILE_ID,
  MINIMAX_H3_CAPABILITY_PROFILE_VERSION,
  MINIMAX_H3_MODEL_KEY,
  PRUNAAI_P_VIDEO_CAPABILITY_PROFILE_ID,
  PRUNAAI_P_VIDEO_CAPABILITY_PROFILE_VERSION,
  PRUNAAI_P_VIDEO_MODEL_KEY,
} from '@genfeedai/contracts/api-types/contracts/video-generation-capability-profile.contract';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';

export type VideoGenerationBriefDispatch = Record<string, unknown>;

export interface VideoGenerationBriefCompileResult {
  brief: VideoGenerationBrief;
  dispatch: VideoGenerationBriefDispatch;
  evidence: VideoGenerationBriefPersistedEvidence;
}

export interface VideoGenerationBriefCompileInput {
  brief: VideoGenerationBrief;
  modelKey: string;
  seed?: number;
}

export type VideoGenerationBriefCompileFn = (
  input: VideoGenerationBriefCompileInput,
) => VideoGenerationBriefCompileResult;

export interface VideoGenerationBriefRegistryEntry {
  compile: VideoGenerationBriefCompileFn;
  compilerId: string;
  compilerVersion: number;
  modelKey: string;
  profileId: string;
  profileVersion: number;
}

const VIDEO_GENERATION_BRIEF_REGISTRY_ENTRIES: VideoGenerationBriefRegistryEntry[] =
  [
    {
      compile: ({ brief, seed }) =>
        compilePrunaaiPVideoGenerationBrief({ brief, seed }),
      compilerId: PRUNAAI_P_VIDEO_COMPILER_ID,
      compilerVersion: PRUNAAI_P_VIDEO_COMPILER_VERSION,
      modelKey: PRUNAAI_P_VIDEO_MODEL_KEY,
      profileId: PRUNAAI_P_VIDEO_CAPABILITY_PROFILE_ID,
      profileVersion: PRUNAAI_P_VIDEO_CAPABILITY_PROFILE_VERSION,
    },
    {
      compile: ({ brief, seed }) =>
        compileMinimaxH3GenerationBrief({ brief, seed }),
      compilerId: MINIMAX_H3_COMPILER_ID,
      compilerVersion: MINIMAX_H3_COMPILER_VERSION,
      modelKey: MINIMAX_H3_MODEL_KEY,
      profileId: MINIMAX_H3_CAPABILITY_PROFILE_ID,
      profileVersion: MINIMAX_H3_CAPABILITY_PROFILE_VERSION,
    },
    ...REMAINING_VIDEO_GENERATION_BRIEF_FAMILIES.flatMap((family) =>
      family.profiles.map((profile) => ({
        compile: ({
          brief,
          modelKey,
          seed,
        }: VideoGenerationBriefCompileInput) =>
          compileRemainingVideoGenerationBrief({
            brief,
            family,
            modelKey,
            seed,
          }),
        compilerId: family.compilerId,
        compilerVersion: family.compilerVersion,
        modelKey: profile.modelKey,
        profileId: profile.id,
        profileVersion: profile.version,
      })),
    ),
  ];

export const VIDEO_GENERATION_BRIEF_REGISTRY: ReadonlyMap<
  string,
  VideoGenerationBriefRegistryEntry
> = new Map(
  VIDEO_GENERATION_BRIEF_REGISTRY_ENTRIES.map((entry) => [
    entry.modelKey,
    entry,
  ]),
);

export function getVideoGenerationBriefRegistryEntry(
  modelKey: string,
): VideoGenerationBriefRegistryEntry | undefined {
  return VIDEO_GENERATION_BRIEF_REGISTRY.get(modelKey);
}

const VIDEO_GENERATION_BRIEF_EXEMPTION_ENTRIES: ReadonlyArray<
  readonly [string, GenerationBriefExemptionReason]
> = [
  [MODEL_KEYS.REPLICATE_LUMA_REFRAME_VIDEO, 'non_generative_transform'],
  [MODEL_KEYS.REPLICATE_TOPAZ_VIDEO_UPSCALE, 'non_generative_transform'],
  [MODEL_KEYS.REPLICATE_BYTEDANCE_VIDEO_UPSCALER, 'non_generative_transform'],
  [MODEL_KEYS.REPLICATE_KWAIVGI_KLING_O1, 'non_generative_transform'],
];

export const VIDEO_GENERATION_BRIEF_EXEMPTIONS: ReadonlyMap<
  string,
  GenerationBriefExemptionReason
> = new Map(VIDEO_GENERATION_BRIEF_EXEMPTION_ENTRIES);

export function getVideoGenerationBriefExemptionReason(
  modelKey: string,
): GenerationBriefExemptionReason | undefined {
  return VIDEO_GENERATION_BRIEF_EXEMPTIONS.get(modelKey);
}
