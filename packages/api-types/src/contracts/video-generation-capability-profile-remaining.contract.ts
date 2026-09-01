/**
 * Capability profiles for remaining selectable video model keys under #1650.
 */

import { z } from 'zod';
import { generationReferenceRoleValues } from './generation-brief.contract';
import {
  generationCapabilityNegativePromptSchema,
  generationCapabilityPromptSchema,
  generationCapabilityTextRenderingSchema,
  generationCapabilityToggleSchema,
} from './generation-capability-profile.contract';
import {
  videoGenerationCapabilityDurationSchema,
  videoGenerationCapabilityReferencesSchema,
  videoGenerationModeSchema,
} from './video-generation-capability-profile.contract';

const remainingVideoDispatchDefaultsSchema = z
  .object({
    resolution: z.string().trim().min(1).max(32).optional(),
  })
  .strict();

export const remainingVideoCapabilityProfileSchema = z
  .object({
    aspectRatios: z
      .array(z.string().regex(/^[1-9]\d{0,3}:[1-9]\d{0,3}$/))
      .min(1)
      .max(20),
    audio: generationCapabilityToggleSchema,
    defaultAspectRatio: z.string().regex(/^[1-9]\d{0,3}:[1-9]\d{0,3}$/),
    defaults: remainingVideoDispatchDefaultsSchema,
    duration: videoGenerationCapabilityDurationSchema,
    generationModes: z.array(videoGenerationModeSchema).min(1).max(8),
    id: z.string().trim().min(1).max(255),
    isBatchSupported: z.boolean(),
    maxOutputs: z.number().int().positive().max(8),
    maxVideoReferences: z.number().int().nonnegative().max(10).optional(),
    mediaKind: z.literal('video'),
    modelKey: z.string().trim().min(1).max(255),
    negativePrompt: generationCapabilityNegativePromptSchema,
    prompt: generationCapabilityPromptSchema,
    references: videoGenerationCapabilityReferencesSchema,
    resolution: generationCapabilityToggleSchema,
    seed: generationCapabilityToggleSchema,
    textRendering: generationCapabilityTextRenderingSchema,
    version: z.number().int().positive(),
  })
  .strict();

export type RemainingVideoCapabilityProfile = z.infer<
  typeof remainingVideoCapabilityProfileSchema
>;

const REMAINING_VIDEO_ASPECT_RATIOS = [
  '16:9',
  '9:16',
  '4:3',
  '3:4',
  '1:1',
] as const;

const FIRST_FRAME_NATIVE_FIELDS = new Set([
  'image',
  'image_url',
  'input_reference',
  'start_image',
]);
const LAST_FRAME_NATIVE_FIELDS = new Set([
  'end_image',
  'end_image_url',
  'last_frame',
  'last_frame_image',
  'last_image',
]);

export function deriveRemainingVideoReferenceRoles(
  nativeFields: readonly string[],
): (typeof generationReferenceRoleValues)[number][] {
  const roles = new Set<(typeof generationReferenceRoleValues)[number]>();
  if (nativeFields.some((field) => FIRST_FRAME_NATIVE_FIELDS.has(field))) {
    roles.add('first_frame');
    roles.add('subject');
  }
  if (nativeFields.some((field) => LAST_FRAME_NATIVE_FIELDS.has(field))) {
    roles.add('last_frame');
  }
  if (
    nativeFields.includes('image_urls') ||
    nativeFields.includes('reference_images')
  ) {
    for (const role of [
      'subject',
      'character',
      'product',
      'style',
      'composition',
    ] as const) {
      roles.add(role);
    }
  }
  if (
    nativeFields.includes('reference_video') ||
    nativeFields.includes('reference_videos')
  ) {
    roles.add('reference_video');
  }
  return generationReferenceRoleValues.filter((role) => roles.has(role));
}

export function buildRemainingVideoCapabilityProfile(input: {
  aspectRatios?: readonly string[];
  audioSupported?: boolean;
  defaultAspectRatio?: string;
  defaultResolution?: string;
  defaultSeconds?: number;
  id: string;
  maxReferences: number;
  maxVideoReferences?: number;
  maxSeconds?: number;
  minSeconds?: number;
  modelKey: string;
  nativeFields?: string[];
  negativePromptSupported?: boolean;
  requireImageToVideo?: boolean;
  seedSupported?: boolean;
}): RemainingVideoCapabilityProfile {
  const maxReferences = input.maxReferences;
  const nativeFields = input.nativeFields ?? [];
  return remainingVideoCapabilityProfileSchema.parse({
    aspectRatios: [...(input.aspectRatios ?? REMAINING_VIDEO_ASPECT_RATIOS)],
    audio: { supported: input.audioSupported === true },
    defaultAspectRatio: input.defaultAspectRatio ?? '16:9',
    defaults: input.defaultResolution
      ? { resolution: input.defaultResolution }
      : {},
    duration: {
      defaultSeconds: input.defaultSeconds ?? 5,
      maxSeconds: input.maxSeconds ?? 15,
      minSeconds: input.minSeconds ?? 1,
      supported: true,
    },
    generationModes: input.requireImageToVideo
      ? ['image_to_video']
      : ['text_to_video', 'image_to_video'],
    id: input.id,
    isBatchSupported: false,
    maxOutputs: 4,
    ...(input.maxVideoReferences === undefined
      ? {}
      : { maxVideoReferences: input.maxVideoReferences }),
    mediaKind: 'video',
    modelKey: input.modelKey,
    negativePrompt: { supported: input.negativePromptSupported === true },
    prompt: {
      enhancement: 'unsupported',
      format: 'natural_language',
      maxCharacters: 10_000,
    },
    references: {
      max: maxReferences,
      nativeFields,
      roles:
        maxReferences > 0
          ? deriveRemainingVideoReferenceRoles(nativeFields)
          : [],
    },
    resolution: { supported: input.defaultResolution !== undefined },
    seed: { supported: input.seedSupported !== false },
    textRendering: 'prompt_only',
    version: 1,
  });
}
