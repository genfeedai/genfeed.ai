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
  FLUX_SCHNELL_MODEL_KEY,
} from './generation-capability-profile.contract';

export const FLUX_SCHNELL_IMAGE_COMPILER_ID = 'flux-schnell-image-compiler';
export const FLUX_SCHNELL_IMAGE_COMPILER_VERSION = 1;
export const GENERATION_BRIEF_CONTRACT_VERSION = 1;

export const generationBriefExemptionReasonValues = [
  'legacy_prompt_builder',
  'non_generative_transform',
] as const;

export const generationBriefExemptionReasonSchema = z.enum(
  generationBriefExemptionReasonValues,
);

export const generationBriefCompileSupportSchema = z
  .object({
    compilerId: z.literal(FLUX_SCHNELL_IMAGE_COMPILER_ID),
    compilerVersion: z.literal(FLUX_SCHNELL_IMAGE_COMPILER_VERSION),
    kind: z.literal('compile'),
    modelKey: z.literal(FLUX_SCHNELL_MODEL_KEY),
    profileId: z.literal(FLUX_SCHNELL_CAPABILITY_PROFILE_ID),
    profileVersion: z.literal(FLUX_SCHNELL_CAPABILITY_PROFILE_VERSION),
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
    compilerId: z.literal(FLUX_SCHNELL_IMAGE_COMPILER_ID),
    compilerVersion: z.literal(FLUX_SCHNELL_IMAGE_COMPILER_VERSION),
    fidelityMode: generationFidelityModeSchema,
    mediaKind: z.literal('image'),
    modelKey: z.literal(FLUX_SCHNELL_MODEL_KEY),
    omittedSignals: z.array(generationBriefOmittedSignalSchema).max(50),
    output: generationBriefCompileEvidenceOutputSchema,
    profileId: z.literal(FLUX_SCHNELL_CAPABILITY_PROFILE_ID),
    profileVersion: z.literal(FLUX_SCHNELL_CAPABILITY_PROFILE_VERSION),
    referenceAssetIds: z.array(z.string().trim().min(1).max(255)).max(20),
    status: z.literal('compiled'),
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

export function buildFluxSchnellGenerationSource(): string {
  return [
    'generation-brief',
    `v${GENERATION_BRIEF_CONTRACT_VERSION}`,
    `${FLUX_SCHNELL_CAPABILITY_PROFILE_ID}@${FLUX_SCHNELL_CAPABILITY_PROFILE_VERSION}`,
    `${FLUX_SCHNELL_IMAGE_COMPILER_ID}@${FLUX_SCHNELL_IMAGE_COMPILER_VERSION}`,
  ].join(':');
}

export function buildGenerationBriefExemptionSource(
  reason: GenerationBriefExemptionReason,
): string {
  return `generation-brief-exemption:${reason}`;
}
