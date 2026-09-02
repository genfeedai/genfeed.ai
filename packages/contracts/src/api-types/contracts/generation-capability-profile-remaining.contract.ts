/**
 * Capability profiles for remaining selectable image model keys under #1650.
 * Sibling keys that share a dispatch shape reuse one compiler id; each key
 * still gets its own profile id + modelKey so evidence stays honest.
 */

import { z } from 'zod';
import { imageGenerationReferenceRoleValues } from './generation-brief.contract';
import { generationCapabilityProfileBaseSchema } from './generation-capability-profile.contract';

const remainingImageDispatchDefaultsSchema = z
  .object({
    outputFormat: z.string().trim().min(1).max(32),
  })
  .strict();

export const remainingImageCapabilityProfileSchema =
  generationCapabilityProfileBaseSchema
    .extend({ defaults: remainingImageDispatchDefaultsSchema })
    .strict();

export type RemainingImageCapabilityProfile = z.infer<
  typeof remainingImageCapabilityProfileSchema
>;

const REMAINING_IMAGE_ASPECT_RATIOS = [
  '1:1',
  '16:9',
  '9:16',
  '4:3',
  '3:4',
  '3:2',
  '2:3',
  '4:5',
  '21:9',
] as const;

const ALL_IMAGE_REFERENCE_ROLES = [...imageGenerationReferenceRoleValues];

export function buildRemainingImageCapabilityProfile(input: {
  defaultAspectRatio?: string;
  id: string;
  maxReferences: number;
  modelKey: string;
  nativeFields?: string[];
  negativePromptSupported?: boolean;
  seedSupported?: boolean;
}): RemainingImageCapabilityProfile {
  const maxReferences = input.maxReferences;
  return remainingImageCapabilityProfileSchema.parse({
    aspectRatios: [...REMAINING_IMAGE_ASPECT_RATIOS],
    audio: { supported: false },
    defaultAspectRatio: input.defaultAspectRatio ?? '1:1',
    defaults: { outputFormat: 'jpg' },
    duration: { supported: false },
    firstLastFrames: { supported: false },
    generationModes:
      maxReferences > 0
        ? ['text_to_image', 'image_to_image']
        : ['text_to_image'],
    id: input.id,
    isBatchSupported: false,
    maxOutputs: 4,
    mediaKind: 'image',
    modelKey: input.modelKey,
    negativePrompt: { supported: input.negativePromptSupported === true },
    prompt: {
      enhancement: 'unsupported',
      format: 'natural_language',
      maxCharacters: 10_000,
    },
    references: {
      max: maxReferences,
      nativeFields: input.nativeFields ?? [],
      roles: maxReferences > 0 ? ALL_IMAGE_REFERENCE_ROLES : [],
    },
    resolution: { supported: false },
    seed: { supported: input.seedSupported !== false },
    textRendering: 'prompt_only',
    version: 1,
  });
}
