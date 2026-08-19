/**
 * Versioned provider/model capability profiles for generation-brief compilation.
 *
 * Profiles describe what a model can honor natively. They do not carry prompt
 * text, credentials, or signed URLs. Runtime compilation stays a separate
 * concern so adding a model does not invent a second brief contract.
 *
 * First runtime profile is FLUX Schnell (#3193) under parent #1650.
 */

import { z } from 'zod';
import {
  generationBriefMediaKindSchema,
  imageGenerationReferenceRoleSchema,
} from './generation-brief.contract';

export const generationCapabilityPromptFormatValues = [
  'natural_language',
] as const;

export const generationCapabilityEnhancementValues = [
  'unsupported',
  'optional',
  'default_on',
] as const;

export const generationCapabilityTextRenderingValues = [
  'unsupported',
  'prompt_only',
  'native',
] as const;

export const imageGenerationModeValues = [
  'text_to_image',
  'image_to_image',
] as const;

export const generationCapabilityPromptFormatSchema = z.enum(
  generationCapabilityPromptFormatValues,
);
export const generationCapabilityEnhancementSchema = z.enum(
  generationCapabilityEnhancementValues,
);
export const generationCapabilityTextRenderingSchema = z.enum(
  generationCapabilityTextRenderingValues,
);
export const imageGenerationModeSchema = z.enum(imageGenerationModeValues);

const generationCapabilityIdSchema = z.string().trim().min(1).max(255);

export const generationCapabilityPromptSchema = z
  .object({
    enhancement: generationCapabilityEnhancementSchema,
    format: generationCapabilityPromptFormatSchema,
    maxCharacters: z.number().int().positive().max(20_000),
  })
  .strict();

export const generationCapabilityNegativePromptSchema = z
  .object({
    supported: z.boolean(),
  })
  .strict();

export const generationCapabilityReferencesSchema = z
  .object({
    max: z.number().int().nonnegative().max(32),
    nativeFields: z.array(generationCapabilityIdSchema).max(20),
    roles: z.array(imageGenerationReferenceRoleSchema).max(20),
  })
  .strict();

export const generationCapabilityToggleSchema = z
  .object({
    supported: z.boolean(),
  })
  .strict();

export const fluxSchnellDispatchDefaultsSchema = z
  .object({
    disableSafetyChecker: z.boolean(),
    goFast: z.boolean(),
    numInferenceSteps: z.number().int().positive().max(50),
    numOutputs: z.number().int().positive().max(8),
    outputFormat: generationCapabilityIdSchema,
    outputQuality: z.number().int().min(0).max(100),
  })
  .strict();

export const generationCapabilityProfileSchema = z
  .object({
    aspectRatios: z
      .array(z.string().regex(/^[1-9]\d{0,3}:[1-9]\d{0,3}$/))
      .min(1)
      .max(20),
    audio: generationCapabilityToggleSchema,
    defaultAspectRatio: z.string().regex(/^[1-9]\d{0,3}:[1-9]\d{0,3}$/),
    defaults: fluxSchnellDispatchDefaultsSchema,
    duration: generationCapabilityToggleSchema,
    firstLastFrames: generationCapabilityToggleSchema,
    generationModes: z.array(imageGenerationModeSchema).min(1).max(8),
    id: generationCapabilityIdSchema,
    isBatchSupported: z.boolean(),
    maxOutputs: z.number().int().positive().max(8),
    mediaKind: generationBriefMediaKindSchema,
    modelKey: generationCapabilityIdSchema,
    negativePrompt: generationCapabilityNegativePromptSchema,
    prompt: generationCapabilityPromptSchema,
    references: generationCapabilityReferencesSchema,
    resolution: generationCapabilityToggleSchema,
    seed: generationCapabilityToggleSchema,
    textRendering: generationCapabilityTextRenderingSchema,
    version: z.number().int().positive(),
  })
  .strict();

export type GenerationCapabilityProfile = z.infer<
  typeof generationCapabilityProfileSchema
>;
export type FluxSchnellDispatchDefaults = z.infer<
  typeof fluxSchnellDispatchDefaultsSchema
>;

export const FLUX_SCHNELL_CAPABILITY_PROFILE_ID = 'flux-schnell-capability';
export const FLUX_SCHNELL_CAPABILITY_PROFILE_VERSION = 1;
export const FLUX_SCHNELL_MODEL_KEY = 'black-forest-labs/flux-schnell';

export const FLUX_SCHNELL_ASPECT_RATIOS = [
  '1:1',
  '16:9',
  '9:16',
  '4:3',
  '3:4',
  '3:2',
  '2:3',
] as const;

export const FLUX_SCHNELL_CAPABILITY_PROFILE =
  generationCapabilityProfileSchema.parse({
    aspectRatios: [...FLUX_SCHNELL_ASPECT_RATIOS],
    audio: { supported: false },
    defaultAspectRatio: '1:1',
    defaults: {
      disableSafetyChecker: false,
      goFast: true,
      numInferenceSteps: 4,
      numOutputs: 1,
      outputFormat: 'jpg',
      outputQuality: 80,
    },
    duration: { supported: false },
    firstLastFrames: { supported: false },
    generationModes: ['text_to_image'],
    id: FLUX_SCHNELL_CAPABILITY_PROFILE_ID,
    isBatchSupported: false,
    maxOutputs: 4,
    mediaKind: 'image',
    modelKey: FLUX_SCHNELL_MODEL_KEY,
    negativePrompt: { supported: false },
    prompt: {
      enhancement: 'unsupported',
      format: 'natural_language',
      maxCharacters: 10_000,
    },
    references: {
      max: 0,
      nativeFields: [],
      roles: [],
    },
    resolution: { supported: false },
    seed: { supported: true },
    textRendering: 'prompt_only',
    version: FLUX_SCHNELL_CAPABILITY_PROFILE_VERSION,
  });
