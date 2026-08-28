/**
 * Versioned provider/model capability profiles for video generation-brief compilation.
 *
 * Mirrors generation-capability-profile.contract.ts (image, FLUX Schnell only) as its own file
 * rather than parameterizing that one — each selectable video family gets an explicit, fully
 * typed profile instead of a generic shared shape, matching how the image profile is scoped to
 * a single model.
 *
 * First runtime profiles are PrunaAI P-Video and MiniMax H3 (#3468) under parent #1650.
 */

import { z } from 'zod';
import {
  generationBriefMediaKindSchema,
  generationReferenceRoleSchema,
} from './generation-brief.contract';
import {
  generationCapabilityNegativePromptSchema,
  generationCapabilityPromptSchema,
  generationCapabilityTextRenderingSchema,
  generationCapabilityToggleSchema,
} from './generation-capability-profile.contract';

export const videoGenerationModeValues = [
  'text_to_video',
  'image_to_video',
] as const;

export const videoGenerationModeSchema = z.enum(videoGenerationModeValues);

const videoGenerationCapabilityIdSchema = z.string().trim().min(1).max(255);

export const videoGenerationCapabilityReferencesSchema = z
  .object({
    max: z.number().int().nonnegative().max(32),
    nativeFields: z.array(videoGenerationCapabilityIdSchema).max(20),
    roles: z.array(generationReferenceRoleSchema).max(20),
  })
  .strict();

export const videoGenerationCapabilityDurationSchema = z
  .object({
    defaultSeconds: z.number().positive().max(300),
    maxSeconds: z.number().positive().max(300),
    minSeconds: z.number().positive().max(300),
    supported: z.boolean(),
  })
  .strict();

export type VideoGenerationMode = z.infer<typeof videoGenerationModeSchema>;
export type VideoGenerationCapabilityReferences = z.infer<
  typeof videoGenerationCapabilityReferencesSchema
>;
export type VideoGenerationCapabilityDuration = z.infer<
  typeof videoGenerationCapabilityDurationSchema
>;

const aspectRatioLiteralSchema = z
  .string()
  .regex(/^[1-9]\d{0,3}:[1-9]\d{0,3}$/);

// ---------------------------------------------------------------------------
// PrunaAI P-Video
// ---------------------------------------------------------------------------

export const PRUNAAI_P_VIDEO_CAPABILITY_PROFILE_ID =
  'prunaai-p-video-capability';
export const PRUNAAI_P_VIDEO_CAPABILITY_PROFILE_VERSION = 1;
export const PRUNAAI_P_VIDEO_MODEL_KEY = 'prunaai/p-video';

export const prunaaiPVideoDispatchDefaultsSchema = z
  .object({
    promptUpsampling: z.literal(true),
  })
  .strict();

export const prunaaiPVideoCapabilityProfileSchema = z
  .object({
    aspectRatios: z.array(aspectRatioLiteralSchema).min(1).max(20),
    audio: generationCapabilityToggleSchema,
    defaultAspectRatio: aspectRatioLiteralSchema,
    defaults: prunaaiPVideoDispatchDefaultsSchema,
    duration: videoGenerationCapabilityDurationSchema,
    generationModes: z.array(videoGenerationModeSchema).min(1).max(8),
    id: videoGenerationCapabilityIdSchema,
    isBatchSupported: z.boolean(),
    maxOutputs: z.number().int().positive().max(8),
    mediaKind: generationBriefMediaKindSchema,
    modelKey: videoGenerationCapabilityIdSchema,
    negativePrompt: generationCapabilityNegativePromptSchema,
    prompt: generationCapabilityPromptSchema,
    references: videoGenerationCapabilityReferencesSchema,
    resolution: generationCapabilityToggleSchema,
    seed: generationCapabilityToggleSchema,
    textRendering: generationCapabilityTextRenderingSchema,
    version: z.number().int().positive(),
  })
  .strict();

export type PrunaaiPVideoDispatchDefaults = z.infer<
  typeof prunaaiPVideoDispatchDefaultsSchema
>;
export type PrunaaiPVideoCapabilityProfile = z.infer<
  typeof prunaaiPVideoCapabilityProfileSchema
>;

export const PRUNAAI_P_VIDEO_ASPECT_RATIOS = [
  '16:9',
  '9:16',
  '4:3',
  '3:4',
  '3:2',
  '2:3',
  '1:1',
] as const;

export const PRUNAAI_P_VIDEO_CAPABILITY_PROFILE =
  prunaaiPVideoCapabilityProfileSchema.parse({
    aspectRatios: [...PRUNAAI_P_VIDEO_ASPECT_RATIOS],
    audio: { supported: true },
    defaultAspectRatio: '16:9',
    defaults: { promptUpsampling: true },
    duration: {
      defaultSeconds: 5,
      maxSeconds: 10,
      minSeconds: 1,
      supported: true,
    },
    generationModes: ['text_to_video', 'image_to_video'],
    id: PRUNAAI_P_VIDEO_CAPABILITY_PROFILE_ID,
    isBatchSupported: false,
    maxOutputs: 4,
    mediaKind: 'video',
    modelKey: PRUNAAI_P_VIDEO_MODEL_KEY,
    negativePrompt: { supported: false },
    prompt: {
      enhancement: 'default_on',
      format: 'natural_language',
      maxCharacters: 10_000,
    },
    references: {
      max: 1,
      nativeFields: ['image'],
      roles: ['first_frame'],
    },
    resolution: { supported: true },
    seed: { supported: true },
    textRendering: 'prompt_only',
    version: PRUNAAI_P_VIDEO_CAPABILITY_PROFILE_VERSION,
  });

// ---------------------------------------------------------------------------
// MiniMax H3
// ---------------------------------------------------------------------------

export const MINIMAX_H3_CAPABILITY_PROFILE_ID = 'minimax-h3-capability';
export const MINIMAX_H3_CAPABILITY_PROFILE_VERSION = 2;
export const MINIMAX_H3_MODEL_KEY = 'minimax/h3';

export const minimaxH3DispatchDefaultsSchema = z
  .object({
    resolution: z.enum(['768P', '2K']),
  })
  .strict();

export const minimaxH3CapabilityProfileSchema = z
  .object({
    aspectRatios: z.array(aspectRatioLiteralSchema).min(1).max(20),
    audio: generationCapabilityToggleSchema,
    defaultAspectRatio: aspectRatioLiteralSchema,
    defaults: minimaxH3DispatchDefaultsSchema,
    duration: videoGenerationCapabilityDurationSchema,
    generationModes: z.array(videoGenerationModeSchema).min(1).max(8),
    id: videoGenerationCapabilityIdSchema,
    isBatchSupported: z.boolean(),
    maxVideoReferences: z.number().int().nonnegative().max(32),
    maxOutputs: z.number().int().positive().max(8),
    mediaKind: generationBriefMediaKindSchema,
    modelKey: videoGenerationCapabilityIdSchema,
    negativePrompt: generationCapabilityNegativePromptSchema,
    prompt: generationCapabilityPromptSchema,
    references: videoGenerationCapabilityReferencesSchema,
    resolution: generationCapabilityToggleSchema,
    seed: generationCapabilityToggleSchema,
    textRendering: generationCapabilityTextRenderingSchema,
    version: z.number().int().positive(),
  })
  .strict();

export type MinimaxH3DispatchDefaults = z.infer<
  typeof minimaxH3DispatchDefaultsSchema
>;
export type MinimaxH3CapabilityProfile = z.infer<
  typeof minimaxH3CapabilityProfileSchema
>;

export const MINIMAX_H3_ASPECT_RATIOS = [
  '16:9',
  '9:16',
  '4:3',
  '3:4',
  '1:1',
  '21:9',
] as const;

export const MINIMAX_H3_CAPABILITY_PROFILE =
  minimaxH3CapabilityProfileSchema.parse({
    aspectRatios: [...MINIMAX_H3_ASPECT_RATIOS],
    audio: { supported: true },
    defaultAspectRatio: '16:9',
    defaults: { resolution: '2K' },
    duration: {
      defaultSeconds: 5,
      maxSeconds: 15,
      minSeconds: 4,
      supported: true,
    },
    generationModes: ['text_to_video', 'image_to_video'],
    id: MINIMAX_H3_CAPABILITY_PROFILE_ID,
    isBatchSupported: false,
    maxVideoReferences: 3,
    maxOutputs: 1,
    mediaKind: 'video',
    modelKey: MINIMAX_H3_MODEL_KEY,
    negativePrompt: { supported: false },
    prompt: {
      enhancement: 'unsupported',
      format: 'natural_language',
      maxCharacters: 10_000,
    },
    references: {
      max: 10,
      nativeFields: [
        'first_frame_image',
        'last_frame_image',
        'reference_image_urls',
        'reference_video_urls',
      ],
      roles: [
        'first_frame',
        'last_frame',
        'subject',
        'product',
        'character',
        'style',
        'composition',
        'reference_video',
      ],
    },
    resolution: { supported: true },
    seed: { supported: false },
    textRendering: 'prompt_only',
    version: MINIMAX_H3_CAPABILITY_PROFILE_VERSION,
  });
