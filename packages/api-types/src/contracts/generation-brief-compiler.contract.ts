/**
 * Compiler identity, redacted evidence, and FLUX Schnell dispatch contracts.
 *
 * Compilation must not mutate the normalized brief. Persisted evidence records
 * compiler/profile identity and omitted-signal kinds only — never prompt text,
 * credentials, or signed URLs.
 *
 * First compiler is FLUX Schnell (#3193) under parent #1650.
 */

import { z } from 'zod';
import {
  generationFidelityModeSchema,
  imageGenerationBriefSchema,
} from './generation-brief.contract';
import {
  FLUX_SCHNELL_CAPABILITY_PROFILE_ID,
  FLUX_SCHNELL_CAPABILITY_PROFILE_VERSION,
} from './generation-capability-profile.contract';

export const FLUX_SCHNELL_IMAGE_COMPILER_ID = 'flux-schnell-image-compiler';
export const FLUX_SCHNELL_IMAGE_COMPILER_VERSION = 1;
export const GENERATION_BRIEF_CONTRACT_VERSION = 1;

export const generationBriefExemptionReasonValues = [
  'legacy_prompt_builder',
  'non_generative_transform',
  'model_training_operation',
  'unregistered_model',
] as const;

export const generationBriefExemptionReasonSchema = z.enum(
  generationBriefExemptionReasonValues,
);

/**
 * Every surface that can originate a generation-brief compile/exempt request
 * (#3469). `studio` also covers surfaces that proxy into Studio's own
 * `/v1/images` and `/v1/videos` entry points over an internal HTTP call
 * (MCP generation actions, the agent conversational tool) rather than
 * calling the brief pipeline directly.
 */
export const generationBriefSurfaceValues = [
  'studio',
  'workflow',
  'agent_skill',
  'telegram_bot',
  'schedule',
] as const;

export const generationBriefSurfaceSchema = z.enum(
  generationBriefSurfaceValues,
);

const generationBriefCompilerIdSchema = z.string().trim().min(1).max(255);
const generationBriefCompilerVersionSchema = z.number().int().positive();

export const generationBriefCompileSupportSchema = z
  .object({
    compilerId: generationBriefCompilerIdSchema,
    compilerVersion: generationBriefCompilerVersionSchema,
    kind: z.literal('compile'),
    modelKey: z.string().trim().min(1).max(255),
    profileId: generationBriefCompilerIdSchema,
    profileVersion: generationBriefCompilerVersionSchema,
  })
  .strict();

export const generationBriefExemptSupportSchema = z
  .object({
    compilerId: z.null(),
    kind: z.literal('exempt'),
    modelKey: z.string().trim().min(1).max(255),
    profileId: z.null(),
    reason: generationBriefExemptionReasonSchema,
  })
  .strict();

export const generationBriefSupportSchema = z.discriminatedUnion('kind', [
  generationBriefCompileSupportSchema,
  generationBriefExemptSupportSchema,
]);

export const generationBriefOmittedSignalSchema = z
  .object({
    field: z.string().trim().min(1).max(255),
    reason: z.string().trim().min(1).max(1_000),
  })
  .strict();

export const generationBriefCompileEvidenceOutputSchema = z
  .object({
    aspectRatio: z.string().regex(/^[1-9]\d{0,3}:[1-9]\d{0,3}$/),
    hasSeed: z.boolean(),
    numOutputs: z.number().int().positive().max(8),
    outputFormat: z.string().trim().min(1).max(32),
  })
  .strict();

export const generationBriefCompileEvidenceSchema = z
  .object({
    appliedFields: z.array(z.string().trim().min(1).max(255)).max(50),
    briefVersion: z.literal(GENERATION_BRIEF_CONTRACT_VERSION),
    compilerId: generationBriefCompilerIdSchema,
    compilerVersion: generationBriefCompilerVersionSchema,
    fidelityMode: generationFidelityModeSchema,
    mediaKind: z.literal('image'),
    modelKey: z.string().trim().min(1).max(255),
    omittedSignals: z.array(generationBriefOmittedSignalSchema).max(50),
    output: generationBriefCompileEvidenceOutputSchema,
    profileId: generationBriefCompilerIdSchema,
    profileVersion: generationBriefCompilerVersionSchema,
    referenceAssetIds: z.array(z.string().trim().min(1).max(255)).max(20),
    status: z.literal('compiled'),
    surface: generationBriefSurfaceSchema.optional(),
  })
  .strict();

export const generationBriefExemptionEvidenceSchema = z
  .object({
    compilerId: z.null(),
    compilerVersion: z.null(),
    modelKey: z.string().trim().min(1).max(255),
    profileId: z.null(),
    profileVersion: z.null(),
    reason: generationBriefExemptionReasonSchema,
    status: z.literal('exempted'),
    surface: generationBriefSurfaceSchema.optional(),
  })
  .strict();

export const generationBriefPersistedEvidenceSchema = z.discriminatedUnion(
  'status',
  [
    generationBriefCompileEvidenceSchema,
    generationBriefExemptionEvidenceSchema,
  ],
);

export const fluxSchnellDispatchSchema = z
  .object({
    aspect_ratio: z.string().regex(/^[1-9]\d{0,3}:[1-9]\d{0,3}$/),
    disable_safety_checker: z.boolean(),
    go_fast: z.boolean(),
    num_inference_steps: z.number().int().positive().max(50),
    num_outputs: z.number().int().positive().max(8),
    output_format: z.string().trim().min(1).max(32),
    output_quality: z.number().int().min(0).max(100),
    prompt: z.string().trim().min(1).max(10_000),
    seed: z.number().int().optional(),
  })
  .strict();

export const fluxSchnellCompileResultSchema = z
  .object({
    brief: imageGenerationBriefSchema,
    dispatch: fluxSchnellDispatchSchema,
    evidence: generationBriefCompileEvidenceSchema,
  })
  .strict();

export type GenerationBriefExemptionReason = z.infer<
  typeof generationBriefExemptionReasonSchema
>;
export type GenerationBriefSurface = z.infer<
  typeof generationBriefSurfaceSchema
>;
export type GenerationBriefSupport = z.infer<
  typeof generationBriefSupportSchema
>;
export type GenerationBriefOmittedSignal = z.infer<
  typeof generationBriefOmittedSignalSchema
>;
export type GenerationBriefCompileEvidence = z.infer<
  typeof generationBriefCompileEvidenceSchema
>;
export type GenerationBriefExemptionEvidence = z.infer<
  typeof generationBriefExemptionEvidenceSchema
>;
export type GenerationBriefPersistedEvidence = z.infer<
  typeof generationBriefPersistedEvidenceSchema
>;
export type FluxSchnellDispatch = z.infer<typeof fluxSchnellDispatchSchema>;
export type FluxSchnellCompileResult = z.infer<
  typeof fluxSchnellCompileResultSchema
>;

export interface GenerationBriefCompileSourceInput {
  compilerId: string;
  compilerVersion: number;
  profileId: string;
  profileVersion: number;
}

export function buildGenerationBriefCompileSource(
  input: GenerationBriefCompileSourceInput,
): string {
  return [
    'generation-brief',
    `v${GENERATION_BRIEF_CONTRACT_VERSION}`,
    `${input.profileId}@${input.profileVersion}`,
    `${input.compilerId}@${input.compilerVersion}`,
  ].join(':');
}

export function buildFluxSchnellGenerationSource(): string {
  return buildGenerationBriefCompileSource({
    compilerId: FLUX_SCHNELL_IMAGE_COMPILER_ID,
    compilerVersion: FLUX_SCHNELL_IMAGE_COMPILER_VERSION,
    profileId: FLUX_SCHNELL_CAPABILITY_PROFILE_ID,
    profileVersion: FLUX_SCHNELL_CAPABILITY_PROFILE_VERSION,
  });
}

export function buildGenerationBriefExemptionSource(
  reason: GenerationBriefExemptionReason,
): string {
  return `generation-brief-exemption:${reason}`;
}

/**
 * Phase 2 (#3467) dispatch contracts + compiler identity for every remaining
 * selectable image model family. Sibling model keys with an identical
 * dispatch shape (Imagen x5, Ideogram V3 x3, SeeDream 4.5/5 Lite,
 * FLUX 2 Pro/Max, FLUX Kontext Pro/Max) share one dispatch schema and one
 * compiler id/version — only the capability profile differs per model key.
 */

const aspectRatioFieldSchema = z.string().regex(/^[1-9]\d{0,3}:[1-9]\d{0,3}$/);
const seedFieldSchema = z.number().int().optional();

export const imagenDispatchSchema = z
  .object({
    aspect_ratio: aspectRatioFieldSchema,
    output_format: z.string().trim().min(1).max(32),
    prompt: z.string().trim().min(1).max(10_000),
    safety_filter_level: z.string().trim().min(1).max(64),
  })
  .strict();
export type ImagenDispatch = z.infer<typeof imagenDispatchSchema>;
export const IMAGEN_IMAGE_COMPILER_ID = 'imagen-image-compiler';
export const IMAGEN_IMAGE_COMPILER_VERSION = 1;

export const nanoBananaDispatchSchema = z
  .object({
    image_input: z
      .array(z.string().trim().min(1).max(2_048))
      .max(15)
      .optional(),
    output_format: z.string().trim().min(1).max(32),
    prompt: z.string().trim().min(1).max(10_000),
  })
  .strict();
export type NanoBananaDispatch = z.infer<typeof nanoBananaDispatchSchema>;
export const NANO_BANANA_IMAGE_COMPILER_ID = 'nano-banana-image-compiler';
export const NANO_BANANA_IMAGE_COMPILER_VERSION = 1;

export const nanoBanana2DispatchSchema = z
  .object({
    image_input: z
      .array(z.string().trim().min(1).max(2_048))
      .max(14)
      .optional(),
    output_format: z.string().trim().min(1).max(32),
    resolution: z.string().trim().min(1).max(32).optional(),
    prompt: z.string().trim().min(1).max(10_000),
    safety_filter_level: z.string().trim().min(1).max(64).optional(),
  })
  .strict();
export type NanoBanana2Dispatch = z.infer<typeof nanoBanana2DispatchSchema>;
export const NANO_BANANA_2_IMAGE_COMPILER_ID = 'nano-banana-2-image-compiler';
export const NANO_BANANA_2_IMAGE_COMPILER_VERSION = 1;

export const seedream4DispatchSchema = z
  .object({
    aspect_ratio: aspectRatioFieldSchema,
    enhance_prompt: z.boolean(),
    image_input: z
      .array(z.string().trim().min(1).max(2_048))
      .max(10)
      .optional(),
    prompt: z.string().trim().min(1).max(10_000),
  })
  .strict();
export type Seedream4Dispatch = z.infer<typeof seedream4DispatchSchema>;
export const SEEDREAM_4_IMAGE_COMPILER_ID = 'seedream-4-image-compiler';
export const SEEDREAM_4_IMAGE_COMPILER_VERSION = 1;

export const seedream45DispatchSchema = z
  .object({
    image_input: z
      .array(z.string().trim().min(1).max(2_048))
      .max(14)
      .optional(),
    prompt: z.string().trim().min(1).max(10_000),
    size: z.string().trim().min(1).max(32),
  })
  .strict();
export type Seedream45Dispatch = z.infer<typeof seedream45DispatchSchema>;
export const SEEDREAM_4_5_IMAGE_COMPILER_ID = 'seedream-4-5-image-compiler';
export const SEEDREAM_4_5_IMAGE_COMPILER_VERSION = 1;

export const seedream5ProDispatchSchema = z
  .object({
    image_input: z
      .array(z.string().trim().min(1).max(2_048))
      .max(10)
      .optional(),
    output_format: z.string().trim().min(1).max(32).optional(),
    prompt: z.string().trim().min(1).max(10_000),
    size: z.string().trim().min(1).max(32),
  })
  .strict();
export type Seedream5ProDispatch = z.infer<typeof seedream5ProDispatchSchema>;
export const SEEDREAM_5_PRO_IMAGE_COMPILER_ID = 'seedream-5-pro-image-compiler';
export const SEEDREAM_5_PRO_IMAGE_COMPILER_VERSION = 1;

export const ideogramCharacterDispatchSchema = z
  .object({
    aspect_ratio: aspectRatioFieldSchema,
    character_reference_image: z.string().trim().min(1).max(2_048),
    magic_prompt_option: z.string().trim().min(1).max(32),
    prompt: z.string().trim().min(1).max(10_000),
    seed: seedFieldSchema,
  })
  .strict();
export type IdeogramCharacterDispatch = z.infer<
  typeof ideogramCharacterDispatchSchema
>;
export const IDEOGRAM_CHARACTER_IMAGE_COMPILER_ID =
  'ideogram-character-image-compiler';
export const IDEOGRAM_CHARACTER_IMAGE_COMPILER_VERSION = 1;

export const ideogramV3DispatchSchema = z
  .object({
    aspect_ratio: aspectRatioFieldSchema,
    image: z.string().trim().min(1).max(2_048).optional(),
    magic_prompt_option: z.string().trim().min(1).max(32),
    prompt: z.string().trim().min(1).max(10_000),
    seed: seedFieldSchema,
  })
  .strict();
export type IdeogramV3Dispatch = z.infer<typeof ideogramV3DispatchSchema>;
export const IDEOGRAM_V3_IMAGE_COMPILER_ID = 'ideogram-v3-image-compiler';
export const IDEOGRAM_V3_IMAGE_COMPILER_VERSION = 1;

export const flux11ProDispatchSchema = z
  .object({
    aspect_ratio: aspectRatioFieldSchema,
    image_prompt: z.string().trim().min(1).max(2_048).optional(),
    output_format: z.string().trim().min(1).max(32),
    output_quality: z.number().int().min(0).max(100),
    prompt: z.string().trim().min(1).max(10_000),
    prompt_upsampling: z.boolean(),
    safety_tolerance: z.number().int().min(0).max(6),
    seed: seedFieldSchema,
  })
  .strict();
export type Flux11ProDispatch = z.infer<typeof flux11ProDispatchSchema>;
export const FLUX_1_1_PRO_IMAGE_COMPILER_ID = 'flux-1-1-pro-image-compiler';
export const FLUX_1_1_PRO_IMAGE_COMPILER_VERSION = 1;

export const flux2DevDispatchSchema = z
  .object({
    aspect_ratio: aspectRatioFieldSchema,
    disable_safety_checker: z.boolean(),
    go_fast: z.boolean(),
    input_images: z
      .array(z.string().trim().min(1).max(2_048))
      .max(4)
      .optional(),
    output_format: z.string().trim().min(1).max(32),
    output_quality: z.number().int().min(0).max(100),
    prompt: z.string().trim().min(1).max(10_000),
    seed: seedFieldSchema,
  })
  .strict();
export type Flux2DevDispatch = z.infer<typeof flux2DevDispatchSchema>;
export const FLUX_2_DEV_IMAGE_COMPILER_ID = 'flux-2-dev-image-compiler';
export const FLUX_2_DEV_IMAGE_COMPILER_VERSION = 1;

export const flux2FlexDispatchSchema = z
  .object({
    aspect_ratio: aspectRatioFieldSchema,
    guidance: z.number().min(0).max(10),
    input_images: z
      .array(z.string().trim().min(1).max(2_048))
      .max(10)
      .optional(),
    output_format: z.string().trim().min(1).max(32),
    output_quality: z.number().int().min(0).max(100),
    prompt: z.string().trim().min(1).max(10_000),
    prompt_upsampling: z.boolean(),
    safety_tolerance: z.number().int().min(0).max(6),
    seed: seedFieldSchema,
    steps: z.number().int().positive().max(100),
  })
  .strict();
export type Flux2FlexDispatch = z.infer<typeof flux2FlexDispatchSchema>;
export const FLUX_2_FLEX_IMAGE_COMPILER_ID = 'flux-2-flex-image-compiler';
export const FLUX_2_FLEX_IMAGE_COMPILER_VERSION = 1;

export const flux2ProDispatchSchema = z
  .object({
    aspect_ratio: aspectRatioFieldSchema,
    input_images: z
      .array(z.string().trim().min(1).max(2_048))
      .max(8)
      .optional(),
    output_format: z.string().trim().min(1).max(32),
    output_quality: z.number().int().min(0).max(100),
    prompt: z.string().trim().min(1).max(10_000),
    safety_tolerance: z.number().int().min(0).max(6),
    seed: seedFieldSchema,
  })
  .strict();
export type Flux2ProDispatch = z.infer<typeof flux2ProDispatchSchema>;
export const FLUX_2_PRO_IMAGE_COMPILER_ID = 'flux-2-pro-image-compiler';
export const FLUX_2_PRO_IMAGE_COMPILER_VERSION = 1;

export const fluxKontextProDispatchSchema = z
  .object({
    aspect_ratio: aspectRatioFieldSchema,
    input_image: z.string().trim().min(1).max(2_048),
    output_format: z.string().trim().min(1).max(32),
    prompt: z.string().trim().min(1).max(10_000),
    prompt_upsampling: z.boolean(),
    safety_tolerance: z.number().int().min(0).max(6),
    seed: seedFieldSchema,
  })
  .strict();
export type FluxKontextProDispatch = z.infer<
  typeof fluxKontextProDispatchSchema
>;
export const FLUX_KONTEXT_PRO_IMAGE_COMPILER_ID =
  'flux-kontext-pro-image-compiler';
export const FLUX_KONTEXT_PRO_IMAGE_COMPILER_VERSION = 1;

export const qwenImageDispatchSchema = z
  .object({
    aspect_ratio: aspectRatioFieldSchema,
    disable_safety_checker: z.boolean(),
    enhance_prompt: z.boolean(),
    go_fast: z.boolean(),
    guidance: z.number().min(0).max(10),
    image: z.string().trim().min(1).max(2_048).optional(),
    negative_prompt: z.string().trim().max(10_000).optional(),
    num_inference_steps: z.number().int().positive().max(100),
    output_format: z.string().trim().min(1).max(32),
    output_quality: z.number().int().min(0).max(100),
    prompt: z.string().trim().min(1).max(10_000),
    seed: seedFieldSchema,
    strength: z.number().min(0).max(1),
  })
  .strict();
export type QwenImageDispatch = z.infer<typeof qwenImageDispatchSchema>;
export const QWEN_IMAGE_IMAGE_COMPILER_ID = 'qwen-image-image-compiler';
export const QWEN_IMAGE_IMAGE_COMPILER_VERSION = 1;

export const runwayGen4ImageTurboDispatchSchema = z
  .object({
    prompt: z.string().trim().min(1).max(10_000),
    reference_images: z
      .array(z.string().trim().min(1).max(2_048))
      .max(3)
      .optional(),
    resolution: z.string().trim().min(1).max(32),
    seed: seedFieldSchema,
  })
  .strict();
export type RunwayGen4ImageTurboDispatch = z.infer<
  typeof runwayGen4ImageTurboDispatchSchema
>;
export const RUNWAY_GEN4_IMAGE_TURBO_IMAGE_COMPILER_ID =
  'runway-gen4-image-turbo-image-compiler';
export const RUNWAY_GEN4_IMAGE_TURBO_IMAGE_COMPILER_VERSION = 1;

const remainingImageDispatchValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string().trim().min(1).max(2_048)),
]);

export const remainingImageDispatchSchema = z
  .object({
    prompt: z.string().trim().min(1).max(10_000),
  })
  .catchall(remainingImageDispatchValueSchema);
export type RemainingImageDispatch = z.infer<
  typeof remainingImageDispatchSchema
>;

export const GPT_IMAGE_IMAGE_COMPILER_ID = 'gpt-image-image-compiler';
export const RECRAFT_IMAGE_COMPILER_ID = 'recraft-image-compiler';
export const GROK_IMAGINE_IMAGE_COMPILER_ID = 'grok-imagine-image-compiler';
export const SDXL_IMAGE_COMPILER_ID = 'sdxl-image-compiler';
export const LEONARDO_IMAGE_COMPILER_ID = 'leonardo-image-compiler';
export const HIGGSFIELD_SOUL_IMAGE_COMPILER_ID =
  'higgsfield-soul-image-compiler';
export const FAL_FLUX_IMAGE_COMPILER_ID = 'fal-flux-image-compiler';
export const FAL_FLUX_2_PRO_IMAGE_COMPILER_ID = 'fal-flux-2-pro-image-compiler';
export const FAL_NANO_BANANA_2_IMAGE_COMPILER_ID =
  'fal-nano-banana-2-image-compiler';
export const GENFEED_FLUX_IMAGE_COMPILER_ID = 'genfeed-flux-image-compiler';
export const GENFEED_PULID_IMAGE_COMPILER_ID = 'genfeed-pulid-image-compiler';
export const Z_IMAGE_TURBO_IMAGE_COMPILER_ID = 'z-image-turbo-image-compiler';
export const REMAINING_IMAGE_COMPILER_VERSION = 1;

export type ImageGenerationBriefDispatch =
  | FluxSchnellDispatch
  | ImagenDispatch
  | NanoBananaDispatch
  | NanoBanana2Dispatch
  | Seedream4Dispatch
  | Seedream45Dispatch
  | Seedream5ProDispatch
  | IdeogramCharacterDispatch
  | IdeogramV3Dispatch
  | Flux11ProDispatch
  | Flux2DevDispatch
  | Flux2FlexDispatch
  | Flux2ProDispatch
  | FluxKontextProDispatch
  | QwenImageDispatch
  | RunwayGen4ImageTurboDispatch
  | RemainingImageDispatch;
