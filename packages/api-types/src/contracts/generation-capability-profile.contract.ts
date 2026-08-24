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
  imageGenerationReferenceRoleValues,
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

/**
 * Fields shared by every model family's capability profile. Each family
 * (including FLUX Schnell) extends this with its own concrete `defaults`
 * dispatch shape and applies `.strict()` — this keeps a single family's
 * dispatch-default vocabulary from bloating this shared contract file.
 */
export const generationCapabilityProfileBaseSchema = z.object({
  aspectRatios: z
    .array(z.string().regex(/^[1-9]\d{0,3}:[1-9]\d{0,3}$/))
    .min(1)
    .max(20),
  audio: generationCapabilityToggleSchema,
  defaultAspectRatio: z.string().regex(/^[1-9]\d{0,3}:[1-9]\d{0,3}$/),
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
});

export const generationCapabilityProfileSchema =
  generationCapabilityProfileBaseSchema
    .extend({
      defaults: fluxSchnellDispatchDefaultsSchema,
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

/**
 * Phase 2 (#3467) capability profiles — every remaining selectable image model
 * family, extending `generationCapabilityProfileBaseSchema` exactly as FLUX
 * Schnell did. Each family below is a shared `.extend({ defaults }).strict()`
 * schema plus one `.parse({...})`-built constant per model key it covers, so
 * sibling models that share an identical dispatch shape (e.g. FLUX 2 Pro /
 * FLUX 2 Max) reuse the schema without duplicating the literal.
 */

const ALL_IMAGE_REFERENCE_ROLES = [...imageGenerationReferenceRoleValues];

// --- Imagen (3 / 3 Fast / 4 / 4 Fast / 4 Ultra) --------------------------

export const imagenDispatchDefaultsSchema = z
  .object({
    outputFormat: generationCapabilityIdSchema,
    safetyFilterLevel: generationCapabilityIdSchema,
  })
  .strict();

export const imagenCapabilityProfileSchema =
  generationCapabilityProfileBaseSchema
    .extend({ defaults: imagenDispatchDefaultsSchema })
    .strict();

export type ImagenDispatchDefaults = z.infer<
  typeof imagenDispatchDefaultsSchema
>;
export type ImagenCapabilityProfile = z.infer<
  typeof imagenCapabilityProfileSchema
>;

export const IMAGEN_CAPABILITY_PROFILE_VERSION = 1;
export const IMAGEN_ASPECT_RATIOS = [
  '1:1',
  '9:16',
  '16:9',
  '3:4',
  '4:3',
] as const;

function buildImagenCapabilityProfile(
  id: string,
  modelKey: string,
): ImagenCapabilityProfile {
  return imagenCapabilityProfileSchema.parse({
    aspectRatios: [...IMAGEN_ASPECT_RATIOS],
    audio: { supported: false },
    defaultAspectRatio: '1:1',
    defaults: { outputFormat: 'jpg', safetyFilterLevel: 'block_only_high' },
    duration: { supported: false },
    firstLastFrames: { supported: false },
    generationModes: ['text_to_image'],
    id,
    isBatchSupported: false,
    maxOutputs: 4,
    mediaKind: 'image',
    modelKey,
    negativePrompt: { supported: false },
    prompt: {
      enhancement: 'unsupported',
      format: 'natural_language',
      maxCharacters: 10_000,
    },
    references: { max: 0, nativeFields: [], roles: [] },
    resolution: { supported: false },
    seed: { supported: false },
    textRendering: 'unsupported',
    version: IMAGEN_CAPABILITY_PROFILE_VERSION,
  });
}

export const IMAGEN_3_CAPABILITY_PROFILE_ID = 'imagen-3-capability';
export const IMAGEN_3_FAST_CAPABILITY_PROFILE_ID = 'imagen-3-fast-capability';
export const IMAGEN_4_CAPABILITY_PROFILE_ID = 'imagen-4-capability';
export const IMAGEN_4_FAST_CAPABILITY_PROFILE_ID = 'imagen-4-fast-capability';
export const IMAGEN_4_ULTRA_CAPABILITY_PROFILE_ID = 'imagen-4-ultra-capability';

export const IMAGEN_3_MODEL_KEY = 'google/imagen-3';
export const IMAGEN_3_FAST_MODEL_KEY = 'google/imagen-3-fast';
export const IMAGEN_4_MODEL_KEY = 'google/imagen-4';
export const IMAGEN_4_FAST_MODEL_KEY = 'google/imagen-4-fast';
export const IMAGEN_4_ULTRA_MODEL_KEY = 'google/imagen-4-ultra';

export const IMAGEN_3_CAPABILITY_PROFILE = buildImagenCapabilityProfile(
  IMAGEN_3_CAPABILITY_PROFILE_ID,
  IMAGEN_3_MODEL_KEY,
);
export const IMAGEN_3_FAST_CAPABILITY_PROFILE = buildImagenCapabilityProfile(
  IMAGEN_3_FAST_CAPABILITY_PROFILE_ID,
  IMAGEN_3_FAST_MODEL_KEY,
);
export const IMAGEN_4_CAPABILITY_PROFILE = buildImagenCapabilityProfile(
  IMAGEN_4_CAPABILITY_PROFILE_ID,
  IMAGEN_4_MODEL_KEY,
);
export const IMAGEN_4_FAST_CAPABILITY_PROFILE = buildImagenCapabilityProfile(
  IMAGEN_4_FAST_CAPABILITY_PROFILE_ID,
  IMAGEN_4_FAST_MODEL_KEY,
);
export const IMAGEN_4_ULTRA_CAPABILITY_PROFILE = buildImagenCapabilityProfile(
  IMAGEN_4_ULTRA_CAPABILITY_PROFILE_ID,
  IMAGEN_4_ULTRA_MODEL_KEY,
);

// --- Nano Banana family ---------------------------------------------------

export const nanoBananaDispatchDefaultsSchema = z
  .object({ outputFormat: generationCapabilityIdSchema })
  .strict();
export const nanoBananaCapabilityProfileSchema =
  generationCapabilityProfileBaseSchema
    .extend({ defaults: nanoBananaDispatchDefaultsSchema })
    .strict();
export type NanoBananaDispatchDefaults = z.infer<
  typeof nanoBananaDispatchDefaultsSchema
>;
export type NanoBananaCapabilityProfile = z.infer<
  typeof nanoBananaCapabilityProfileSchema
>;

export const NANO_BANANA_CAPABILITY_PROFILE_VERSION = 1;
export const NANO_BANANA_ASPECT_RATIOS = [
  '1:1',
  '2:3',
  '3:2',
  '3:4',
  '4:3',
  '4:5',
  '5:4',
  '9:16',
  '16:9',
  '21:9',
] as const;
export const NANO_BANANA_CAPABILITY_PROFILE_ID = 'nano-banana-capability';
export const NANO_BANANA_MODEL_KEY = 'google/nano-banana';
export const NANO_BANANA_CAPABILITY_PROFILE =
  nanoBananaCapabilityProfileSchema.parse({
    aspectRatios: [...NANO_BANANA_ASPECT_RATIOS],
    audio: { supported: false },
    defaultAspectRatio: '1:1',
    defaults: { outputFormat: 'jpg' },
    duration: { supported: false },
    firstLastFrames: { supported: false },
    generationModes: ['text_to_image', 'image_to_image'],
    id: NANO_BANANA_CAPABILITY_PROFILE_ID,
    isBatchSupported: false,
    maxOutputs: 4,
    mediaKind: 'image',
    modelKey: NANO_BANANA_MODEL_KEY,
    negativePrompt: { supported: false },
    prompt: {
      enhancement: 'unsupported',
      format: 'natural_language',
      maxCharacters: 10_000,
    },
    references: {
      max: 15,
      nativeFields: ['image_input'],
      roles: ALL_IMAGE_REFERENCE_ROLES,
    },
    resolution: { supported: false },
    seed: { supported: false },
    textRendering: 'prompt_only',
    version: NANO_BANANA_CAPABILITY_PROFILE_VERSION,
  });

// --- Nano Banana 2 family (Pro / 2 / 2 Lite) ------------------------------

export const nanoBanana2DispatchDefaultsSchema = z
  .object({
    outputFormat: generationCapabilityIdSchema,
    safetyFilterLevel: generationCapabilityIdSchema.optional(),
  })
  .strict();
export const nanoBanana2CapabilityProfileSchema =
  generationCapabilityProfileBaseSchema
    .extend({ defaults: nanoBanana2DispatchDefaultsSchema })
    .strict();
export type NanoBanana2DispatchDefaults = z.infer<
  typeof nanoBanana2DispatchDefaultsSchema
>;
export type NanoBanana2CapabilityProfile = z.infer<
  typeof nanoBanana2CapabilityProfileSchema
>;

export const NANO_BANANA_2_CAPABILITY_PROFILE_VERSION = 1;
export const NANO_BANANA_2_ASPECT_RATIOS = [
  '1:1',
  '1:4',
  '1:8',
  '2:3',
  '3:2',
  '3:4',
  '4:1',
  '4:3',
  '4:5',
  '5:4',
  '8:1',
  '9:16',
  '16:9',
  '21:9',
] as const;

function buildNanoBanana2CapabilityProfile(input: {
  id: string;
  modelKey: string;
  maxReferences: number;
  hasResolution: boolean;
  hasSafetyFilterLevel: boolean;
}): NanoBanana2CapabilityProfile {
  return nanoBanana2CapabilityProfileSchema.parse({
    aspectRatios: [...NANO_BANANA_2_ASPECT_RATIOS],
    audio: { supported: false },
    defaultAspectRatio: '1:1',
    defaults: {
      outputFormat: 'jpg',
      ...(input.hasSafetyFilterLevel
        ? { safetyFilterLevel: 'block_only_high' }
        : {}),
    },
    duration: { supported: false },
    firstLastFrames: { supported: false },
    generationModes: ['text_to_image', 'image_to_image'],
    id: input.id,
    isBatchSupported: false,
    maxOutputs: 4,
    mediaKind: 'image',
    modelKey: input.modelKey,
    negativePrompt: { supported: false },
    prompt: {
      enhancement: 'unsupported',
      format: 'natural_language',
      maxCharacters: 10_000,
    },
    references: {
      max: input.maxReferences,
      nativeFields: ['image_input'],
      roles: ALL_IMAGE_REFERENCE_ROLES,
    },
    resolution: { supported: input.hasResolution },
    seed: { supported: false },
    textRendering: 'prompt_only',
    version: NANO_BANANA_2_CAPABILITY_PROFILE_VERSION,
  });
}

export const NANO_BANANA_PRO_CAPABILITY_PROFILE_ID =
  'nano-banana-pro-capability';
export const NANO_BANANA_2_CAPABILITY_PROFILE_ID = 'nano-banana-2-capability';
export const NANO_BANANA_2_LITE_CAPABILITY_PROFILE_ID =
  'nano-banana-2-lite-capability';
export const NANO_BANANA_PRO_MODEL_KEY = 'google/nano-banana-pro';
export const NANO_BANANA_2_MODEL_KEY = 'google/nano-banana-2';
export const NANO_BANANA_2_LITE_MODEL_KEY = 'google/nano-banana-2-lite';

export const NANO_BANANA_PRO_CAPABILITY_PROFILE =
  buildNanoBanana2CapabilityProfile({
    id: NANO_BANANA_PRO_CAPABILITY_PROFILE_ID,
    modelKey: NANO_BANANA_PRO_MODEL_KEY,
    maxReferences: 14,
    hasResolution: true,
    hasSafetyFilterLevel: true,
  });
export const NANO_BANANA_2_CAPABILITY_PROFILE =
  buildNanoBanana2CapabilityProfile({
    id: NANO_BANANA_2_CAPABILITY_PROFILE_ID,
    modelKey: NANO_BANANA_2_MODEL_KEY,
    maxReferences: 14,
    hasResolution: true,
    hasSafetyFilterLevel: false,
  });
export const NANO_BANANA_2_LITE_CAPABILITY_PROFILE =
  buildNanoBanana2CapabilityProfile({
    id: NANO_BANANA_2_LITE_CAPABILITY_PROFILE_ID,
    modelKey: NANO_BANANA_2_LITE_MODEL_KEY,
    maxReferences: 14,
    hasResolution: false,
    hasSafetyFilterLevel: false,
  });

// --- SeeDream 4 ------------------------------------------------------------

export const seedream4DispatchDefaultsSchema = z
  .object({ enhancePrompt: z.boolean() })
  .strict();
export const seedream4CapabilityProfileSchema =
  generationCapabilityProfileBaseSchema
    .extend({ defaults: seedream4DispatchDefaultsSchema })
    .strict();
export type Seedream4DispatchDefaults = z.infer<
  typeof seedream4DispatchDefaultsSchema
>;
export type Seedream4CapabilityProfile = z.infer<
  typeof seedream4CapabilityProfileSchema
>;

export const SEEDREAM_4_CAPABILITY_PROFILE_VERSION = 1;
export const SEEDREAM_ASPECT_RATIOS = [
  '1:1',
  '16:9',
  '9:16',
  '4:3',
  '3:4',
  '3:2',
  '2:3',
  '21:9',
] as const;
export const SEEDREAM_4_CAPABILITY_PROFILE_ID = 'seedream-4-capability';
export const SEEDREAM_4_MODEL_KEY = 'bytedance/seedream-4';
export const SEEDREAM_4_CAPABILITY_PROFILE =
  seedream4CapabilityProfileSchema.parse({
    aspectRatios: [...SEEDREAM_ASPECT_RATIOS],
    audio: { supported: false },
    defaultAspectRatio: '1:1',
    defaults: { enhancePrompt: true },
    duration: { supported: false },
    firstLastFrames: { supported: false },
    generationModes: ['text_to_image', 'image_to_image'],
    id: SEEDREAM_4_CAPABILITY_PROFILE_ID,
    isBatchSupported: false,
    maxOutputs: 4,
    mediaKind: 'image',
    modelKey: SEEDREAM_4_MODEL_KEY,
    negativePrompt: { supported: false },
    prompt: {
      enhancement: 'default_on',
      format: 'natural_language',
      maxCharacters: 10_000,
    },
    references: {
      max: 10,
      nativeFields: ['image_input'],
      roles: ALL_IMAGE_REFERENCE_ROLES,
    },
    resolution: { supported: false },
    seed: { supported: false },
    textRendering: 'prompt_only',
    version: SEEDREAM_4_CAPABILITY_PROFILE_VERSION,
  });

// --- SeeDream 4.5 (shared with SeeDream 5 Lite) ---------------------------

export const seedream45DispatchDefaultsSchema = z
  .object({ size: generationCapabilityIdSchema })
  .strict();
export const seedream45CapabilityProfileSchema =
  generationCapabilityProfileBaseSchema
    .extend({ defaults: seedream45DispatchDefaultsSchema })
    .strict();
export type Seedream45DispatchDefaults = z.infer<
  typeof seedream45DispatchDefaultsSchema
>;
export type Seedream45CapabilityProfile = z.infer<
  typeof seedream45CapabilityProfileSchema
>;

export const SEEDREAM_4_5_CAPABILITY_PROFILE_VERSION = 1;

function buildSeedream45CapabilityProfile(
  id: string,
  modelKey: string,
): Seedream45CapabilityProfile {
  return seedream45CapabilityProfileSchema.parse({
    aspectRatios: [...SEEDREAM_ASPECT_RATIOS],
    audio: { supported: false },
    defaultAspectRatio: '1:1',
    defaults: { size: '2K' },
    duration: { supported: false },
    firstLastFrames: { supported: false },
    generationModes: ['text_to_image', 'image_to_image'],
    id,
    isBatchSupported: false,
    maxOutputs: 4,
    mediaKind: 'image',
    modelKey,
    negativePrompt: { supported: false },
    prompt: {
      enhancement: 'unsupported',
      format: 'natural_language',
      maxCharacters: 10_000,
    },
    references: {
      max: 14,
      nativeFields: ['image_input'],
      roles: ALL_IMAGE_REFERENCE_ROLES,
    },
    resolution: { supported: false },
    seed: { supported: false },
    textRendering: 'prompt_only',
    version: SEEDREAM_4_5_CAPABILITY_PROFILE_VERSION,
  });
}

export const SEEDREAM_4_5_CAPABILITY_PROFILE_ID = 'seedream-4-5-capability';
export const SEEDREAM_5_LITE_CAPABILITY_PROFILE_ID =
  'seedream-5-lite-capability';
export const SEEDREAM_4_5_MODEL_KEY = 'bytedance/seedream-4.5';
export const SEEDREAM_5_LITE_MODEL_KEY = 'bytedance/seedream-5-lite';

export const SEEDREAM_4_5_CAPABILITY_PROFILE = buildSeedream45CapabilityProfile(
  SEEDREAM_4_5_CAPABILITY_PROFILE_ID,
  SEEDREAM_4_5_MODEL_KEY,
);
export const SEEDREAM_5_LITE_CAPABILITY_PROFILE =
  buildSeedream45CapabilityProfile(
    SEEDREAM_5_LITE_CAPABILITY_PROFILE_ID,
    SEEDREAM_5_LITE_MODEL_KEY,
  );

// --- SeeDream 5 Pro ---------------------------------------------------------

export const seedream5ProDispatchDefaultsSchema = z
  .object({
    outputFormat: generationCapabilityIdSchema.optional(),
    size: generationCapabilityIdSchema,
  })
  .strict();
export const seedream5ProCapabilityProfileSchema =
  generationCapabilityProfileBaseSchema
    .extend({ defaults: seedream5ProDispatchDefaultsSchema })
    .strict();
export type Seedream5ProDispatchDefaults = z.infer<
  typeof seedream5ProDispatchDefaultsSchema
>;
export type Seedream5ProCapabilityProfile = z.infer<
  typeof seedream5ProCapabilityProfileSchema
>;

export const SEEDREAM_5_PRO_CAPABILITY_PROFILE_VERSION = 1;
export const SEEDREAM_5_PRO_CAPABILITY_PROFILE_ID = 'seedream-5-pro-capability';
export const SEEDREAM_5_PRO_MODEL_KEY = 'bytedance/seedream-5-pro';
export const SEEDREAM_5_PRO_CAPABILITY_PROFILE =
  seedream5ProCapabilityProfileSchema.parse({
    aspectRatios: [...SEEDREAM_ASPECT_RATIOS],
    audio: { supported: false },
    defaultAspectRatio: '1:1',
    defaults: { size: '2K' },
    duration: { supported: false },
    firstLastFrames: { supported: false },
    generationModes: ['text_to_image', 'image_to_image'],
    id: SEEDREAM_5_PRO_CAPABILITY_PROFILE_ID,
    isBatchSupported: false,
    maxOutputs: 4,
    mediaKind: 'image',
    modelKey: SEEDREAM_5_PRO_MODEL_KEY,
    negativePrompt: { supported: false },
    prompt: {
      enhancement: 'unsupported',
      format: 'natural_language',
      maxCharacters: 10_000,
    },
    references: {
      max: 10,
      nativeFields: ['image_input'],
      roles: ALL_IMAGE_REFERENCE_ROLES,
    },
    resolution: { supported: true },
    seed: { supported: false },
    textRendering: 'prompt_only',
    version: SEEDREAM_5_PRO_CAPABILITY_PROFILE_VERSION,
  });

// --- Ideogram Character ------------------------------------------------------

export const ideogramCharacterDispatchDefaultsSchema = z
  .object({ magicPromptOption: generationCapabilityIdSchema })
  .strict();
export const ideogramCharacterCapabilityProfileSchema =
  generationCapabilityProfileBaseSchema
    .extend({ defaults: ideogramCharacterDispatchDefaultsSchema })
    .strict();
export type IdeogramCharacterDispatchDefaults = z.infer<
  typeof ideogramCharacterDispatchDefaultsSchema
>;
export type IdeogramCharacterCapabilityProfile = z.infer<
  typeof ideogramCharacterCapabilityProfileSchema
>;

export const IDEOGRAM_CAPABILITY_PROFILE_VERSION = 1;
export const IDEOGRAM_ASPECT_RATIOS = [
  '1:3',
  '3:1',
  '1:2',
  '2:1',
  '9:16',
  '16:9',
  '10:16',
  '16:10',
  '2:3',
  '3:2',
  '3:4',
  '4:3',
  '4:5',
  '5:4',
  '1:1',
] as const;
export const IDEOGRAM_CHARACTER_CAPABILITY_PROFILE_ID =
  'ideogram-character-capability';
export const IDEOGRAM_CHARACTER_MODEL_KEY = 'ideogram-ai/ideogram-character';
export const IDEOGRAM_CHARACTER_CAPABILITY_PROFILE =
  ideogramCharacterCapabilityProfileSchema.parse({
    aspectRatios: [...IDEOGRAM_ASPECT_RATIOS],
    audio: { supported: false },
    defaultAspectRatio: '1:1',
    defaults: { magicPromptOption: 'Auto' },
    duration: { supported: false },
    firstLastFrames: { supported: false },
    generationModes: ['image_to_image'],
    id: IDEOGRAM_CHARACTER_CAPABILITY_PROFILE_ID,
    isBatchSupported: false,
    maxOutputs: 4,
    mediaKind: 'image',
    modelKey: IDEOGRAM_CHARACTER_MODEL_KEY,
    negativePrompt: { supported: false },
    prompt: {
      enhancement: 'default_on',
      format: 'natural_language',
      maxCharacters: 10_000,
    },
    references: {
      max: 1,
      nativeFields: ['character_reference_image'],
      roles: ['character'],
    },
    resolution: { supported: true },
    seed: { supported: true },
    textRendering: 'prompt_only',
    version: IDEOGRAM_CAPABILITY_PROFILE_VERSION,
  });

// --- Ideogram V3 (Balanced / Quality / Turbo) ------------------------------

export const ideogramV3DispatchDefaultsSchema = z
  .object({ magicPromptOption: generationCapabilityIdSchema })
  .strict();
export const ideogramV3CapabilityProfileSchema =
  generationCapabilityProfileBaseSchema
    .extend({ defaults: ideogramV3DispatchDefaultsSchema })
    .strict();
export type IdeogramV3DispatchDefaults = z.infer<
  typeof ideogramV3DispatchDefaultsSchema
>;
export type IdeogramV3CapabilityProfile = z.infer<
  typeof ideogramV3CapabilityProfileSchema
>;

export const IDEOGRAM_V3_CAPABILITY_PROFILE_VERSION = 1;

function buildIdeogramV3CapabilityProfile(
  id: string,
  modelKey: string,
): IdeogramV3CapabilityProfile {
  return ideogramV3CapabilityProfileSchema.parse({
    aspectRatios: [...IDEOGRAM_ASPECT_RATIOS],
    audio: { supported: false },
    defaultAspectRatio: '1:1',
    defaults: { magicPromptOption: 'Auto' },
    duration: { supported: false },
    firstLastFrames: { supported: false },
    generationModes: ['text_to_image', 'image_to_image'],
    id,
    isBatchSupported: false,
    maxOutputs: 4,
    mediaKind: 'image',
    modelKey,
    negativePrompt: { supported: false },
    prompt: {
      enhancement: 'default_on',
      format: 'natural_language',
      maxCharacters: 10_000,
    },
    references: {
      max: 1,
      nativeFields: ['image'],
      roles: ALL_IMAGE_REFERENCE_ROLES,
    },
    resolution: { supported: true },
    seed: { supported: true },
    textRendering: 'prompt_only',
    version: IDEOGRAM_V3_CAPABILITY_PROFILE_VERSION,
  });
}

export const IDEOGRAM_V3_BALANCED_CAPABILITY_PROFILE_ID =
  'ideogram-v3-balanced-capability';
export const IDEOGRAM_V3_QUALITY_CAPABILITY_PROFILE_ID =
  'ideogram-v3-quality-capability';
export const IDEOGRAM_V3_TURBO_CAPABILITY_PROFILE_ID =
  'ideogram-v3-turbo-capability';
export const IDEOGRAM_V3_BALANCED_MODEL_KEY =
  'ideogram-ai/ideogram-v3-balanced';
export const IDEOGRAM_V3_QUALITY_MODEL_KEY = 'ideogram-ai/ideogram-v3-quality';
export const IDEOGRAM_V3_TURBO_MODEL_KEY = 'ideogram-ai/ideogram-v3-turbo';

export const IDEOGRAM_V3_BALANCED_CAPABILITY_PROFILE =
  buildIdeogramV3CapabilityProfile(
    IDEOGRAM_V3_BALANCED_CAPABILITY_PROFILE_ID,
    IDEOGRAM_V3_BALANCED_MODEL_KEY,
  );
export const IDEOGRAM_V3_QUALITY_CAPABILITY_PROFILE =
  buildIdeogramV3CapabilityProfile(
    IDEOGRAM_V3_QUALITY_CAPABILITY_PROFILE_ID,
    IDEOGRAM_V3_QUALITY_MODEL_KEY,
  );
export const IDEOGRAM_V3_TURBO_CAPABILITY_PROFILE =
  buildIdeogramV3CapabilityProfile(
    IDEOGRAM_V3_TURBO_CAPABILITY_PROFILE_ID,
    IDEOGRAM_V3_TURBO_MODEL_KEY,
  );

// --- FLUX 1.1 Pro ------------------------------------------------------------

export const flux11ProDispatchDefaultsSchema = z
  .object({
    outputFormat: generationCapabilityIdSchema,
    outputQuality: z.number().int().min(0).max(100),
    promptUpsampling: z.boolean(),
    safetyTolerance: z.number().int().min(0).max(6),
  })
  .strict();
export const flux11ProCapabilityProfileSchema =
  generationCapabilityProfileBaseSchema
    .extend({ defaults: flux11ProDispatchDefaultsSchema })
    .strict();
export type Flux11ProDispatchDefaults = z.infer<
  typeof flux11ProDispatchDefaultsSchema
>;
export type Flux11ProCapabilityProfile = z.infer<
  typeof flux11ProCapabilityProfileSchema
>;

export const FLUX_1_1_PRO_CAPABILITY_PROFILE_VERSION = 1;
export const FLUX_STANDARD_ASPECT_RATIOS = [
  '1:1',
  '16:9',
  '3:2',
  '2:3',
  '4:5',
  '5:4',
  '9:16',
  '3:4',
  '4:3',
] as const;
export const FLUX_1_1_PRO_CAPABILITY_PROFILE_ID = 'flux-1-1-pro-capability';
export const FLUX_1_1_PRO_MODEL_KEY = 'black-forest-labs/flux-1.1-pro';
export const FLUX_1_1_PRO_CAPABILITY_PROFILE =
  flux11ProCapabilityProfileSchema.parse({
    aspectRatios: [...FLUX_STANDARD_ASPECT_RATIOS],
    audio: { supported: false },
    defaultAspectRatio: '1:1',
    defaults: {
      outputFormat: 'webp',
      outputQuality: 80,
      promptUpsampling: false,
      safetyTolerance: 2,
    },
    duration: { supported: false },
    firstLastFrames: { supported: false },
    generationModes: ['text_to_image', 'image_to_image'],
    id: FLUX_1_1_PRO_CAPABILITY_PROFILE_ID,
    isBatchSupported: false,
    maxOutputs: 4,
    mediaKind: 'image',
    modelKey: FLUX_1_1_PRO_MODEL_KEY,
    negativePrompt: { supported: false },
    prompt: {
      enhancement: 'unsupported',
      format: 'natural_language',
      maxCharacters: 10_000,
    },
    references: {
      max: 1,
      nativeFields: ['image_prompt'],
      roles: ALL_IMAGE_REFERENCE_ROLES,
    },
    resolution: { supported: false },
    seed: { supported: true },
    textRendering: 'prompt_only',
    version: FLUX_1_1_PRO_CAPABILITY_PROFILE_VERSION,
  });

// --- FLUX 2 Dev --------------------------------------------------------------

export const flux2DevDispatchDefaultsSchema = z
  .object({
    disableSafetyChecker: z.boolean(),
    goFast: z.boolean(),
    outputFormat: generationCapabilityIdSchema,
    outputQuality: z.number().int().min(0).max(100),
  })
  .strict();
export const flux2DevCapabilityProfileSchema =
  generationCapabilityProfileBaseSchema
    .extend({ defaults: flux2DevDispatchDefaultsSchema })
    .strict();
export type Flux2DevDispatchDefaults = z.infer<
  typeof flux2DevDispatchDefaultsSchema
>;
export type Flux2DevCapabilityProfile = z.infer<
  typeof flux2DevCapabilityProfileSchema
>;

export const FLUX_2_DEV_CAPABILITY_PROFILE_VERSION = 1;
export const FLUX_V2_ASPECT_RATIOS = [
  '1:1',
  '16:9',
  '3:2',
  '2:3',
  '4:5',
  '5:4',
  '9:16',
  '3:4',
  '4:3',
] as const;
export const FLUX_2_DEV_CAPABILITY_PROFILE_ID = 'flux-2-dev-capability';
export const FLUX_2_DEV_MODEL_KEY = 'black-forest-labs/flux-2-dev';
export const FLUX_2_DEV_CAPABILITY_PROFILE =
  flux2DevCapabilityProfileSchema.parse({
    aspectRatios: [...FLUX_V2_ASPECT_RATIOS],
    audio: { supported: false },
    defaultAspectRatio: '1:1',
    defaults: {
      disableSafetyChecker: false,
      goFast: false,
      outputFormat: 'jpg',
      outputQuality: 80,
    },
    duration: { supported: false },
    firstLastFrames: { supported: false },
    generationModes: ['text_to_image', 'image_to_image'],
    id: FLUX_2_DEV_CAPABILITY_PROFILE_ID,
    isBatchSupported: false,
    maxOutputs: 4,
    mediaKind: 'image',
    modelKey: FLUX_2_DEV_MODEL_KEY,
    negativePrompt: { supported: false },
    prompt: {
      enhancement: 'unsupported',
      format: 'natural_language',
      maxCharacters: 10_000,
    },
    references: {
      max: 4,
      nativeFields: ['input_images'],
      roles: ALL_IMAGE_REFERENCE_ROLES,
    },
    resolution: { supported: false },
    seed: { supported: true },
    textRendering: 'prompt_only',
    version: FLUX_2_DEV_CAPABILITY_PROFILE_VERSION,
  });

// --- FLUX 2 Flex --------------------------------------------------------------

export const flux2FlexDispatchDefaultsSchema = z
  .object({
    guidance: z.number().min(0).max(10),
    outputFormat: generationCapabilityIdSchema,
    outputQuality: z.number().int().min(0).max(100),
    promptUpsampling: z.boolean(),
    safetyTolerance: z.number().int().min(0).max(6),
    steps: z.number().int().positive().max(100),
  })
  .strict();
export const flux2FlexCapabilityProfileSchema =
  generationCapabilityProfileBaseSchema
    .extend({ defaults: flux2FlexDispatchDefaultsSchema })
    .strict();
export type Flux2FlexDispatchDefaults = z.infer<
  typeof flux2FlexDispatchDefaultsSchema
>;
export type Flux2FlexCapabilityProfile = z.infer<
  typeof flux2FlexCapabilityProfileSchema
>;

export const FLUX_2_FLEX_CAPABILITY_PROFILE_VERSION = 1;
export const FLUX_2_FLEX_CAPABILITY_PROFILE_ID = 'flux-2-flex-capability';
export const FLUX_2_FLEX_MODEL_KEY = 'black-forest-labs/flux-2-flex';
export const FLUX_2_FLEX_CAPABILITY_PROFILE =
  flux2FlexCapabilityProfileSchema.parse({
    aspectRatios: [...FLUX_V2_ASPECT_RATIOS],
    audio: { supported: false },
    defaultAspectRatio: '1:1',
    defaults: {
      guidance: 4.5,
      outputFormat: 'jpg',
      outputQuality: 80,
      promptUpsampling: true,
      safetyTolerance: 2,
      steps: 30,
    },
    duration: { supported: false },
    firstLastFrames: { supported: false },
    generationModes: ['text_to_image', 'image_to_image'],
    id: FLUX_2_FLEX_CAPABILITY_PROFILE_ID,
    isBatchSupported: false,
    maxOutputs: 4,
    mediaKind: 'image',
    modelKey: FLUX_2_FLEX_MODEL_KEY,
    negativePrompt: { supported: false },
    prompt: {
      enhancement: 'unsupported',
      format: 'natural_language',
      maxCharacters: 10_000,
    },
    references: {
      max: 10,
      nativeFields: ['input_images'],
      roles: ALL_IMAGE_REFERENCE_ROLES,
    },
    resolution: { supported: true },
    seed: { supported: true },
    textRendering: 'prompt_only',
    version: FLUX_2_FLEX_CAPABILITY_PROFILE_VERSION,
  });

// --- FLUX 2 Pro (shared with FLUX 2 Max) -------------------------------------

export const flux2ProDispatchDefaultsSchema = z
  .object({
    outputFormat: generationCapabilityIdSchema,
    outputQuality: z.number().int().min(0).max(100),
    safetyTolerance: z.number().int().min(0).max(6),
  })
  .strict();
export const flux2ProCapabilityProfileSchema =
  generationCapabilityProfileBaseSchema
    .extend({ defaults: flux2ProDispatchDefaultsSchema })
    .strict();
export type Flux2ProDispatchDefaults = z.infer<
  typeof flux2ProDispatchDefaultsSchema
>;
export type Flux2ProCapabilityProfile = z.infer<
  typeof flux2ProCapabilityProfileSchema
>;

export const FLUX_2_PRO_CAPABILITY_PROFILE_VERSION = 1;

function buildFlux2ProCapabilityProfile(
  id: string,
  modelKey: string,
): Flux2ProCapabilityProfile {
  return flux2ProCapabilityProfileSchema.parse({
    aspectRatios: [...FLUX_V2_ASPECT_RATIOS],
    audio: { supported: false },
    defaultAspectRatio: '1:1',
    defaults: { outputFormat: 'jpg', outputQuality: 80, safetyTolerance: 2 },
    duration: { supported: false },
    firstLastFrames: { supported: false },
    generationModes: ['text_to_image', 'image_to_image'],
    id,
    isBatchSupported: false,
    maxOutputs: 4,
    mediaKind: 'image',
    modelKey,
    negativePrompt: { supported: false },
    prompt: {
      enhancement: 'unsupported',
      format: 'natural_language',
      maxCharacters: 10_000,
    },
    references: {
      max: 8,
      nativeFields: ['input_images'],
      roles: ALL_IMAGE_REFERENCE_ROLES,
    },
    resolution: { supported: true },
    seed: { supported: true },
    textRendering: 'prompt_only',
    version: FLUX_2_PRO_CAPABILITY_PROFILE_VERSION,
  });
}

export const FLUX_2_PRO_CAPABILITY_PROFILE_ID = 'flux-2-pro-capability';
export const FLUX_2_MAX_CAPABILITY_PROFILE_ID = 'flux-2-max-capability';
export const FLUX_2_PRO_MODEL_KEY = 'black-forest-labs/flux-2-pro';
export const FLUX_2_MAX_MODEL_KEY = 'black-forest-labs/flux-2-max';

export const FLUX_2_PRO_CAPABILITY_PROFILE = buildFlux2ProCapabilityProfile(
  FLUX_2_PRO_CAPABILITY_PROFILE_ID,
  FLUX_2_PRO_MODEL_KEY,
);
export const FLUX_2_MAX_CAPABILITY_PROFILE = buildFlux2ProCapabilityProfile(
  FLUX_2_MAX_CAPABILITY_PROFILE_ID,
  FLUX_2_MAX_MODEL_KEY,
);

// --- FLUX Kontext Pro (shared with FLUX Kontext Max) -------------------------

export const fluxKontextProDispatchDefaultsSchema = z
  .object({
    outputFormat: generationCapabilityIdSchema,
    promptUpsampling: z.boolean(),
    safetyTolerance: z.number().int().min(0).max(6),
  })
  .strict();
export const fluxKontextProCapabilityProfileSchema =
  generationCapabilityProfileBaseSchema
    .extend({ defaults: fluxKontextProDispatchDefaultsSchema })
    .strict();
export type FluxKontextProDispatchDefaults = z.infer<
  typeof fluxKontextProDispatchDefaultsSchema
>;
export type FluxKontextProCapabilityProfile = z.infer<
  typeof fluxKontextProCapabilityProfileSchema
>;

export const FLUX_KONTEXT_PRO_CAPABILITY_PROFILE_VERSION = 1;
export const FLUX_KONTEXT_ASPECT_RATIOS = [
  '1:1',
  '16:9',
  '9:16',
  '4:3',
  '3:4',
  '3:2',
  '2:3',
  '4:5',
  '5:4',
  '21:9',
  '9:21',
  '2:1',
  '1:2',
] as const;

function buildFluxKontextProCapabilityProfile(
  id: string,
  modelKey: string,
): FluxKontextProCapabilityProfile {
  return fluxKontextProCapabilityProfileSchema.parse({
    aspectRatios: [...FLUX_KONTEXT_ASPECT_RATIOS],
    audio: { supported: false },
    defaultAspectRatio: '1:1',
    defaults: {
      outputFormat: 'jpg',
      promptUpsampling: false,
      safetyTolerance: 2,
    },
    duration: { supported: false },
    firstLastFrames: { supported: false },
    generationModes: ['image_to_image'],
    id,
    isBatchSupported: false,
    maxOutputs: 4,
    mediaKind: 'image',
    modelKey,
    negativePrompt: { supported: false },
    prompt: {
      enhancement: 'unsupported',
      format: 'natural_language',
      maxCharacters: 10_000,
    },
    references: {
      max: 1,
      nativeFields: ['input_image'],
      roles: ALL_IMAGE_REFERENCE_ROLES,
    },
    resolution: { supported: false },
    seed: { supported: true },
    textRendering: 'prompt_only',
    version: FLUX_KONTEXT_PRO_CAPABILITY_PROFILE_VERSION,
  });
}

export const FLUX_KONTEXT_PRO_CAPABILITY_PROFILE_ID =
  'flux-kontext-pro-capability';
export const FLUX_KONTEXT_MAX_CAPABILITY_PROFILE_ID =
  'flux-kontext-max-capability';
export const FLUX_KONTEXT_PRO_MODEL_KEY = 'black-forest-labs/flux-kontext-pro';
export const FLUX_KONTEXT_MAX_MODEL_KEY = 'black-forest-labs/flux-kontext-max';

export const FLUX_KONTEXT_PRO_CAPABILITY_PROFILE =
  buildFluxKontextProCapabilityProfile(
    FLUX_KONTEXT_PRO_CAPABILITY_PROFILE_ID,
    FLUX_KONTEXT_PRO_MODEL_KEY,
  );
export const FLUX_KONTEXT_MAX_CAPABILITY_PROFILE =
  buildFluxKontextProCapabilityProfile(
    FLUX_KONTEXT_MAX_CAPABILITY_PROFILE_ID,
    FLUX_KONTEXT_MAX_MODEL_KEY,
  );

// --- Qwen Image ---------------------------------------------------------------

export const qwenImageDispatchDefaultsSchema = z
  .object({
    disableSafetyChecker: z.boolean(),
    enhancePrompt: z.boolean(),
    goFast: z.boolean(),
    guidance: z.number().min(0).max(10),
    numInferenceSteps: z.number().int().positive().max(100),
    outputFormat: generationCapabilityIdSchema,
    outputQuality: z.number().int().min(0).max(100),
    strength: z.number().min(0).max(1),
  })
  .strict();
export const qwenImageCapabilityProfileSchema =
  generationCapabilityProfileBaseSchema
    .extend({ defaults: qwenImageDispatchDefaultsSchema })
    .strict();
export type QwenImageDispatchDefaults = z.infer<
  typeof qwenImageDispatchDefaultsSchema
>;
export type QwenImageCapabilityProfile = z.infer<
  typeof qwenImageCapabilityProfileSchema
>;

export const QWEN_IMAGE_CAPABILITY_PROFILE_VERSION = 1;
export const QWEN_IMAGE_CAPABILITY_PROFILE_ID = 'qwen-image-capability';
export const QWEN_IMAGE_MODEL_KEY = 'qwen/qwen-image';
export const QWEN_IMAGE_CAPABILITY_PROFILE =
  qwenImageCapabilityProfileSchema.parse({
    aspectRatios: [...FLUX_STANDARD_ASPECT_RATIOS],
    audio: { supported: false },
    defaultAspectRatio: '1:1',
    defaults: {
      disableSafetyChecker: false,
      enhancePrompt: false,
      goFast: true,
      guidance: 3,
      numInferenceSteps: 30,
      outputFormat: 'jpg',
      outputQuality: 80,
      strength: 0.9,
    },
    duration: { supported: false },
    firstLastFrames: { supported: false },
    generationModes: ['text_to_image', 'image_to_image'],
    id: QWEN_IMAGE_CAPABILITY_PROFILE_ID,
    isBatchSupported: false,
    maxOutputs: 4,
    mediaKind: 'image',
    modelKey: QWEN_IMAGE_MODEL_KEY,
    negativePrompt: { supported: true },
    prompt: {
      enhancement: 'optional',
      format: 'natural_language',
      maxCharacters: 10_000,
    },
    references: {
      max: 1,
      nativeFields: ['image'],
      roles: ALL_IMAGE_REFERENCE_ROLES,
    },
    resolution: { supported: false },
    seed: { supported: true },
    textRendering: 'prompt_only',
    version: QWEN_IMAGE_CAPABILITY_PROFILE_VERSION,
  });

// --- RunwayML Gen4 Image Turbo -------------------------------------------------

export const runwayGen4ImageTurboDispatchDefaultsSchema = z
  .object({ resolution: generationCapabilityIdSchema })
  .strict();
export const runwayGen4ImageTurboCapabilityProfileSchema =
  generationCapabilityProfileBaseSchema
    .extend({ defaults: runwayGen4ImageTurboDispatchDefaultsSchema })
    .strict();
export type RunwayGen4ImageTurboDispatchDefaults = z.infer<
  typeof runwayGen4ImageTurboDispatchDefaultsSchema
>;
export type RunwayGen4ImageTurboCapabilityProfile = z.infer<
  typeof runwayGen4ImageTurboCapabilityProfileSchema
>;

export const RUNWAY_GEN4_IMAGE_TURBO_CAPABILITY_PROFILE_VERSION = 1;
export const RUNWAY_GEN4_ASPECT_RATIOS = [
  '16:9',
  '9:16',
  '4:3',
  '3:4',
  '1:1',
  '21:9',
] as const;
export const RUNWAY_GEN4_IMAGE_TURBO_CAPABILITY_PROFILE_ID =
  'runway-gen4-image-turbo-capability';
export const RUNWAY_GEN4_IMAGE_TURBO_MODEL_KEY = 'runwayml/gen4-image-turbo';
export const RUNWAY_GEN4_IMAGE_TURBO_CAPABILITY_PROFILE =
  runwayGen4ImageTurboCapabilityProfileSchema.parse({
    aspectRatios: [...RUNWAY_GEN4_ASPECT_RATIOS],
    audio: { supported: false },
    defaultAspectRatio: '1:1',
    defaults: { resolution: '1080p' },
    duration: { supported: false },
    firstLastFrames: { supported: false },
    generationModes: ['text_to_image', 'image_to_image'],
    id: RUNWAY_GEN4_IMAGE_TURBO_CAPABILITY_PROFILE_ID,
    isBatchSupported: false,
    maxOutputs: 4,
    mediaKind: 'image',
    modelKey: RUNWAY_GEN4_IMAGE_TURBO_MODEL_KEY,
    negativePrompt: { supported: false },
    prompt: {
      enhancement: 'unsupported',
      format: 'natural_language',
      maxCharacters: 10_000,
    },
    references: {
      max: 3,
      nativeFields: ['reference_images'],
      roles: ALL_IMAGE_REFERENCE_ROLES,
    },
    resolution: { supported: true },
    seed: { supported: true },
    textRendering: 'prompt_only',
    version: RUNWAY_GEN4_IMAGE_TURBO_CAPABILITY_PROFILE_VERSION,
  });
