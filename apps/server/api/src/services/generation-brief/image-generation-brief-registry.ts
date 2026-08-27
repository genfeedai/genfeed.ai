/**
 * Phase 2 (#3467) registry mapping every selectable image model key to its
 * compiler + capability-profile identity, plus the explicit, enumerated
 * exemption reason for every model key that is not (yet, or ever) brief-
 * compiled. `resolveImageGenerationBriefSupport` is the sole consumer of
 * both maps — it must never fall back to a catch-all exemption reason for a
 * key that is missing from both.
 */

import { compileFlux11ProGenerationBrief } from '@api/services/generation-brief/compile-flux-1-1-pro-generation-brief';
import { compileFlux2DevGenerationBrief } from '@api/services/generation-brief/compile-flux-2-dev-generation-brief';
import { compileFlux2FlexGenerationBrief } from '@api/services/generation-brief/compile-flux-2-flex-generation-brief';
import { compileFlux2ProGenerationBrief } from '@api/services/generation-brief/compile-flux-2-pro-generation-brief';
import { compileFluxKontextProGenerationBrief } from '@api/services/generation-brief/compile-flux-kontext-pro-generation-brief';
import { compileFluxSchnellGenerationBrief } from '@api/services/generation-brief/compile-flux-schnell-generation-brief';
import { compileIdeogramCharacterGenerationBrief } from '@api/services/generation-brief/compile-ideogram-character-generation-brief';
import { compileIdeogramV3GenerationBrief } from '@api/services/generation-brief/compile-ideogram-v3-generation-brief';
import { compileImagenGenerationBrief } from '@api/services/generation-brief/compile-imagen-generation-brief';
import { compileNanoBanana2GenerationBrief } from '@api/services/generation-brief/compile-nano-banana-2-generation-brief';
import { compileNanoBananaGenerationBrief } from '@api/services/generation-brief/compile-nano-banana-generation-brief';
import { compileQwenImageGenerationBrief } from '@api/services/generation-brief/compile-qwen-image-generation-brief';
import { compileRemainingImageGenerationBrief } from '@api/services/generation-brief/compile-remaining-image-generation-brief';
import { compileRunwayGen4ImageTurboGenerationBrief } from '@api/services/generation-brief/compile-runwayml-gen4-image-turbo-generation-brief';
import { compileSeedream45GenerationBrief } from '@api/services/generation-brief/compile-seedream-4-5-generation-brief';
import { compileSeedream4GenerationBrief } from '@api/services/generation-brief/compile-seedream-4-generation-brief';
import { compileSeedream5ProGenerationBrief } from '@api/services/generation-brief/compile-seedream-5-pro-generation-brief';
import { REMAINING_IMAGE_GENERATION_BRIEF_FAMILIES } from '@api/services/generation-brief/remaining-image-generation-brief-families';
import type { ImageGenerationBrief } from '@api-types/contracts/generation-brief.contract';
import type {
  GenerationBriefCompileEvidence,
  GenerationBriefExemptionReason,
} from '@api-types/contracts/generation-brief-compiler.contract';
import {
  FLUX_1_1_PRO_IMAGE_COMPILER_ID,
  FLUX_1_1_PRO_IMAGE_COMPILER_VERSION,
  FLUX_2_DEV_IMAGE_COMPILER_ID,
  FLUX_2_DEV_IMAGE_COMPILER_VERSION,
  FLUX_2_FLEX_IMAGE_COMPILER_ID,
  FLUX_2_FLEX_IMAGE_COMPILER_VERSION,
  FLUX_2_PRO_IMAGE_COMPILER_ID,
  FLUX_2_PRO_IMAGE_COMPILER_VERSION,
  FLUX_KONTEXT_PRO_IMAGE_COMPILER_ID,
  FLUX_KONTEXT_PRO_IMAGE_COMPILER_VERSION,
  FLUX_SCHNELL_IMAGE_COMPILER_ID,
  FLUX_SCHNELL_IMAGE_COMPILER_VERSION,
  IDEOGRAM_CHARACTER_IMAGE_COMPILER_ID,
  IDEOGRAM_CHARACTER_IMAGE_COMPILER_VERSION,
  IDEOGRAM_V3_IMAGE_COMPILER_ID,
  IDEOGRAM_V3_IMAGE_COMPILER_VERSION,
  IMAGEN_IMAGE_COMPILER_ID,
  IMAGEN_IMAGE_COMPILER_VERSION,
  NANO_BANANA_2_IMAGE_COMPILER_ID,
  NANO_BANANA_2_IMAGE_COMPILER_VERSION,
  NANO_BANANA_IMAGE_COMPILER_ID,
  NANO_BANANA_IMAGE_COMPILER_VERSION,
  QWEN_IMAGE_IMAGE_COMPILER_ID,
  QWEN_IMAGE_IMAGE_COMPILER_VERSION,
  RUNWAY_GEN4_IMAGE_TURBO_IMAGE_COMPILER_ID,
  RUNWAY_GEN4_IMAGE_TURBO_IMAGE_COMPILER_VERSION,
  SEEDREAM_4_5_IMAGE_COMPILER_ID,
  SEEDREAM_4_5_IMAGE_COMPILER_VERSION,
  SEEDREAM_4_IMAGE_COMPILER_ID,
  SEEDREAM_4_IMAGE_COMPILER_VERSION,
  SEEDREAM_5_PRO_IMAGE_COMPILER_ID,
  SEEDREAM_5_PRO_IMAGE_COMPILER_VERSION,
} from '@api-types/contracts/generation-brief-compiler.contract';
import {
  FLUX_1_1_PRO_CAPABILITY_PROFILE_ID,
  FLUX_1_1_PRO_CAPABILITY_PROFILE_VERSION,
  FLUX_1_1_PRO_MODEL_KEY,
  FLUX_2_DEV_CAPABILITY_PROFILE_ID,
  FLUX_2_DEV_CAPABILITY_PROFILE_VERSION,
  FLUX_2_DEV_MODEL_KEY,
  FLUX_2_FLEX_CAPABILITY_PROFILE_ID,
  FLUX_2_FLEX_CAPABILITY_PROFILE_VERSION,
  FLUX_2_FLEX_MODEL_KEY,
  FLUX_2_MAX_CAPABILITY_PROFILE_ID,
  FLUX_2_MAX_MODEL_KEY,
  FLUX_2_PRO_CAPABILITY_PROFILE_ID,
  FLUX_2_PRO_CAPABILITY_PROFILE_VERSION,
  FLUX_2_PRO_MODEL_KEY,
  FLUX_KONTEXT_MAX_CAPABILITY_PROFILE_ID,
  FLUX_KONTEXT_MAX_MODEL_KEY,
  FLUX_KONTEXT_PRO_CAPABILITY_PROFILE_ID,
  FLUX_KONTEXT_PRO_CAPABILITY_PROFILE_VERSION,
  FLUX_KONTEXT_PRO_MODEL_KEY,
  FLUX_SCHNELL_CAPABILITY_PROFILE_ID,
  FLUX_SCHNELL_CAPABILITY_PROFILE_VERSION,
  FLUX_SCHNELL_MODEL_KEY,
  IDEOGRAM_CAPABILITY_PROFILE_VERSION,
  IDEOGRAM_CHARACTER_CAPABILITY_PROFILE_ID,
  IDEOGRAM_CHARACTER_MODEL_KEY,
  IDEOGRAM_V3_BALANCED_CAPABILITY_PROFILE_ID,
  IDEOGRAM_V3_BALANCED_MODEL_KEY,
  IDEOGRAM_V3_CAPABILITY_PROFILE_VERSION,
  IDEOGRAM_V3_QUALITY_CAPABILITY_PROFILE_ID,
  IDEOGRAM_V3_QUALITY_MODEL_KEY,
  IDEOGRAM_V3_TURBO_CAPABILITY_PROFILE_ID,
  IDEOGRAM_V3_TURBO_MODEL_KEY,
  IMAGEN_3_CAPABILITY_PROFILE_ID,
  IMAGEN_3_FAST_CAPABILITY_PROFILE_ID,
  IMAGEN_3_FAST_MODEL_KEY,
  IMAGEN_3_MODEL_KEY,
  IMAGEN_4_CAPABILITY_PROFILE_ID,
  IMAGEN_4_FAST_CAPABILITY_PROFILE_ID,
  IMAGEN_4_FAST_MODEL_KEY,
  IMAGEN_4_MODEL_KEY,
  IMAGEN_4_ULTRA_CAPABILITY_PROFILE_ID,
  IMAGEN_4_ULTRA_MODEL_KEY,
  IMAGEN_CAPABILITY_PROFILE_VERSION,
  NANO_BANANA_2_CAPABILITY_PROFILE_ID,
  NANO_BANANA_2_CAPABILITY_PROFILE_VERSION,
  NANO_BANANA_2_LITE_CAPABILITY_PROFILE_ID,
  NANO_BANANA_2_LITE_MODEL_KEY,
  NANO_BANANA_2_MODEL_KEY,
  NANO_BANANA_CAPABILITY_PROFILE_ID,
  NANO_BANANA_CAPABILITY_PROFILE_VERSION,
  NANO_BANANA_MODEL_KEY,
  NANO_BANANA_PRO_CAPABILITY_PROFILE_ID,
  NANO_BANANA_PRO_MODEL_KEY,
  QWEN_IMAGE_CAPABILITY_PROFILE_ID,
  QWEN_IMAGE_CAPABILITY_PROFILE_VERSION,
  QWEN_IMAGE_MODEL_KEY,
  RUNWAY_GEN4_IMAGE_TURBO_CAPABILITY_PROFILE_ID,
  RUNWAY_GEN4_IMAGE_TURBO_CAPABILITY_PROFILE_VERSION,
  RUNWAY_GEN4_IMAGE_TURBO_MODEL_KEY,
  SEEDREAM_4_5_CAPABILITY_PROFILE_ID,
  SEEDREAM_4_5_CAPABILITY_PROFILE_VERSION,
  SEEDREAM_4_5_MODEL_KEY,
  SEEDREAM_4_CAPABILITY_PROFILE_ID,
  SEEDREAM_4_CAPABILITY_PROFILE_VERSION,
  SEEDREAM_4_MODEL_KEY,
  SEEDREAM_5_LITE_CAPABILITY_PROFILE_ID,
  SEEDREAM_5_LITE_MODEL_KEY,
  SEEDREAM_5_PRO_CAPABILITY_PROFILE_ID,
  SEEDREAM_5_PRO_CAPABILITY_PROFILE_VERSION,
  SEEDREAM_5_PRO_MODEL_KEY,
} from '@api-types/contracts/generation-capability-profile.contract';
import { MODEL_KEYS } from '@genfeedai/constants';

/** Structural dispatch payload — each family's compiler returns its own
 * strict, provider-shaped dispatch type; this widens it for registry-level
 * storage without discarding any of the compiler's own runtime validation. */
export type ImageGenerationBriefDispatch = Record<string, unknown>;

export interface ImageGenerationBriefCompileResult {
  brief: ImageGenerationBrief;
  dispatch: ImageGenerationBriefDispatch;
  evidence: GenerationBriefCompileEvidence;
}

export interface ImageGenerationBriefCompileInput {
  brief: ImageGenerationBrief;
  modelKey: string;
  seed?: number;
}

export type ImageGenerationBriefCompileFn = (
  input: ImageGenerationBriefCompileInput,
) => ImageGenerationBriefCompileResult;

export interface ImageGenerationBriefRegistryEntry {
  compile: ImageGenerationBriefCompileFn;
  compilerId: string;
  compilerVersion: number;
  modelKey: string;
  profileId: string;
  profileVersion: number;
}

const IMAGE_GENERATION_BRIEF_REGISTRY_ENTRIES: ImageGenerationBriefRegistryEntry[] =
  [
    {
      compile: ({ brief, seed }) =>
        compileFluxSchnellGenerationBrief({ brief, seed }),
      compilerId: FLUX_SCHNELL_IMAGE_COMPILER_ID,
      compilerVersion: FLUX_SCHNELL_IMAGE_COMPILER_VERSION,
      modelKey: FLUX_SCHNELL_MODEL_KEY,
      profileId: FLUX_SCHNELL_CAPABILITY_PROFILE_ID,
      profileVersion: FLUX_SCHNELL_CAPABILITY_PROFILE_VERSION,
    },
    {
      compile: ({ brief, modelKey, seed }) =>
        compileFlux11ProGenerationBrief({ brief, modelKey, seed }),
      compilerId: FLUX_1_1_PRO_IMAGE_COMPILER_ID,
      compilerVersion: FLUX_1_1_PRO_IMAGE_COMPILER_VERSION,
      modelKey: FLUX_1_1_PRO_MODEL_KEY,
      profileId: FLUX_1_1_PRO_CAPABILITY_PROFILE_ID,
      profileVersion: FLUX_1_1_PRO_CAPABILITY_PROFILE_VERSION,
    },
    {
      compile: ({ brief, modelKey, seed }) =>
        compileFlux2DevGenerationBrief({ brief, modelKey, seed }),
      compilerId: FLUX_2_DEV_IMAGE_COMPILER_ID,
      compilerVersion: FLUX_2_DEV_IMAGE_COMPILER_VERSION,
      modelKey: FLUX_2_DEV_MODEL_KEY,
      profileId: FLUX_2_DEV_CAPABILITY_PROFILE_ID,
      profileVersion: FLUX_2_DEV_CAPABILITY_PROFILE_VERSION,
    },
    {
      compile: ({ brief, modelKey, seed }) =>
        compileFlux2FlexGenerationBrief({ brief, modelKey, seed }),
      compilerId: FLUX_2_FLEX_IMAGE_COMPILER_ID,
      compilerVersion: FLUX_2_FLEX_IMAGE_COMPILER_VERSION,
      modelKey: FLUX_2_FLEX_MODEL_KEY,
      profileId: FLUX_2_FLEX_CAPABILITY_PROFILE_ID,
      profileVersion: FLUX_2_FLEX_CAPABILITY_PROFILE_VERSION,
    },
    {
      compile: ({ brief, modelKey, seed }) =>
        compileFlux2ProGenerationBrief({ brief, modelKey, seed }),
      compilerId: FLUX_2_PRO_IMAGE_COMPILER_ID,
      compilerVersion: FLUX_2_PRO_IMAGE_COMPILER_VERSION,
      modelKey: FLUX_2_PRO_MODEL_KEY,
      profileId: FLUX_2_PRO_CAPABILITY_PROFILE_ID,
      profileVersion: FLUX_2_PRO_CAPABILITY_PROFILE_VERSION,
    },
    {
      compile: ({ brief, modelKey, seed }) =>
        compileFlux2ProGenerationBrief({ brief, modelKey, seed }),
      compilerId: FLUX_2_PRO_IMAGE_COMPILER_ID,
      compilerVersion: FLUX_2_PRO_IMAGE_COMPILER_VERSION,
      modelKey: FLUX_2_MAX_MODEL_KEY,
      profileId: FLUX_2_MAX_CAPABILITY_PROFILE_ID,
      profileVersion: FLUX_2_PRO_CAPABILITY_PROFILE_VERSION,
    },
    {
      compile: ({ brief, modelKey, seed }) =>
        compileFluxKontextProGenerationBrief({ brief, modelKey, seed }),
      compilerId: FLUX_KONTEXT_PRO_IMAGE_COMPILER_ID,
      compilerVersion: FLUX_KONTEXT_PRO_IMAGE_COMPILER_VERSION,
      modelKey: FLUX_KONTEXT_PRO_MODEL_KEY,
      profileId: FLUX_KONTEXT_PRO_CAPABILITY_PROFILE_ID,
      profileVersion: FLUX_KONTEXT_PRO_CAPABILITY_PROFILE_VERSION,
    },
    {
      compile: ({ brief, modelKey, seed }) =>
        compileFluxKontextProGenerationBrief({ brief, modelKey, seed }),
      compilerId: FLUX_KONTEXT_PRO_IMAGE_COMPILER_ID,
      compilerVersion: FLUX_KONTEXT_PRO_IMAGE_COMPILER_VERSION,
      modelKey: FLUX_KONTEXT_MAX_MODEL_KEY,
      profileId: FLUX_KONTEXT_MAX_CAPABILITY_PROFILE_ID,
      profileVersion: FLUX_KONTEXT_PRO_CAPABILITY_PROFILE_VERSION,
    },
    {
      compile: ({ brief, modelKey, seed }) =>
        compileIdeogramCharacterGenerationBrief({ brief, modelKey, seed }),
      compilerId: IDEOGRAM_CHARACTER_IMAGE_COMPILER_ID,
      compilerVersion: IDEOGRAM_CHARACTER_IMAGE_COMPILER_VERSION,
      modelKey: IDEOGRAM_CHARACTER_MODEL_KEY,
      profileId: IDEOGRAM_CHARACTER_CAPABILITY_PROFILE_ID,
      profileVersion: IDEOGRAM_CAPABILITY_PROFILE_VERSION,
    },
    {
      compile: ({ brief, modelKey, seed }) =>
        compileIdeogramV3GenerationBrief({ brief, modelKey, seed }),
      compilerId: IDEOGRAM_V3_IMAGE_COMPILER_ID,
      compilerVersion: IDEOGRAM_V3_IMAGE_COMPILER_VERSION,
      modelKey: IDEOGRAM_V3_BALANCED_MODEL_KEY,
      profileId: IDEOGRAM_V3_BALANCED_CAPABILITY_PROFILE_ID,
      profileVersion: IDEOGRAM_V3_CAPABILITY_PROFILE_VERSION,
    },
    {
      compile: ({ brief, modelKey, seed }) =>
        compileIdeogramV3GenerationBrief({ brief, modelKey, seed }),
      compilerId: IDEOGRAM_V3_IMAGE_COMPILER_ID,
      compilerVersion: IDEOGRAM_V3_IMAGE_COMPILER_VERSION,
      modelKey: IDEOGRAM_V3_QUALITY_MODEL_KEY,
      profileId: IDEOGRAM_V3_QUALITY_CAPABILITY_PROFILE_ID,
      profileVersion: IDEOGRAM_V3_CAPABILITY_PROFILE_VERSION,
    },
    {
      compile: ({ brief, modelKey, seed }) =>
        compileIdeogramV3GenerationBrief({ brief, modelKey, seed }),
      compilerId: IDEOGRAM_V3_IMAGE_COMPILER_ID,
      compilerVersion: IDEOGRAM_V3_IMAGE_COMPILER_VERSION,
      modelKey: IDEOGRAM_V3_TURBO_MODEL_KEY,
      profileId: IDEOGRAM_V3_TURBO_CAPABILITY_PROFILE_ID,
      profileVersion: IDEOGRAM_V3_CAPABILITY_PROFILE_VERSION,
    },
    {
      compile: ({ brief, modelKey }) =>
        compileImagenGenerationBrief({ brief, modelKey }),
      compilerId: IMAGEN_IMAGE_COMPILER_ID,
      compilerVersion: IMAGEN_IMAGE_COMPILER_VERSION,
      modelKey: IMAGEN_3_MODEL_KEY,
      profileId: IMAGEN_3_CAPABILITY_PROFILE_ID,
      profileVersion: IMAGEN_CAPABILITY_PROFILE_VERSION,
    },
    {
      compile: ({ brief, modelKey }) =>
        compileImagenGenerationBrief({ brief, modelKey }),
      compilerId: IMAGEN_IMAGE_COMPILER_ID,
      compilerVersion: IMAGEN_IMAGE_COMPILER_VERSION,
      modelKey: IMAGEN_3_FAST_MODEL_KEY,
      profileId: IMAGEN_3_FAST_CAPABILITY_PROFILE_ID,
      profileVersion: IMAGEN_CAPABILITY_PROFILE_VERSION,
    },
    {
      compile: ({ brief, modelKey }) =>
        compileImagenGenerationBrief({ brief, modelKey }),
      compilerId: IMAGEN_IMAGE_COMPILER_ID,
      compilerVersion: IMAGEN_IMAGE_COMPILER_VERSION,
      modelKey: IMAGEN_4_MODEL_KEY,
      profileId: IMAGEN_4_CAPABILITY_PROFILE_ID,
      profileVersion: IMAGEN_CAPABILITY_PROFILE_VERSION,
    },
    {
      compile: ({ brief, modelKey }) =>
        compileImagenGenerationBrief({ brief, modelKey }),
      compilerId: IMAGEN_IMAGE_COMPILER_ID,
      compilerVersion: IMAGEN_IMAGE_COMPILER_VERSION,
      modelKey: IMAGEN_4_FAST_MODEL_KEY,
      profileId: IMAGEN_4_FAST_CAPABILITY_PROFILE_ID,
      profileVersion: IMAGEN_CAPABILITY_PROFILE_VERSION,
    },
    {
      compile: ({ brief, modelKey }) =>
        compileImagenGenerationBrief({ brief, modelKey }),
      compilerId: IMAGEN_IMAGE_COMPILER_ID,
      compilerVersion: IMAGEN_IMAGE_COMPILER_VERSION,
      modelKey: IMAGEN_4_ULTRA_MODEL_KEY,
      profileId: IMAGEN_4_ULTRA_CAPABILITY_PROFILE_ID,
      profileVersion: IMAGEN_CAPABILITY_PROFILE_VERSION,
    },
    {
      compile: ({ brief, modelKey }) =>
        compileNanoBananaGenerationBrief({ brief, modelKey }),
      compilerId: NANO_BANANA_IMAGE_COMPILER_ID,
      compilerVersion: NANO_BANANA_IMAGE_COMPILER_VERSION,
      modelKey: NANO_BANANA_MODEL_KEY,
      profileId: NANO_BANANA_CAPABILITY_PROFILE_ID,
      profileVersion: NANO_BANANA_CAPABILITY_PROFILE_VERSION,
    },
    {
      compile: ({ brief, modelKey }) =>
        compileNanoBanana2GenerationBrief({ brief, modelKey }),
      compilerId: NANO_BANANA_2_IMAGE_COMPILER_ID,
      compilerVersion: NANO_BANANA_2_IMAGE_COMPILER_VERSION,
      modelKey: NANO_BANANA_PRO_MODEL_KEY,
      profileId: NANO_BANANA_PRO_CAPABILITY_PROFILE_ID,
      profileVersion: NANO_BANANA_2_CAPABILITY_PROFILE_VERSION,
    },
    {
      compile: ({ brief, modelKey }) =>
        compileNanoBanana2GenerationBrief({ brief, modelKey }),
      compilerId: NANO_BANANA_2_IMAGE_COMPILER_ID,
      compilerVersion: NANO_BANANA_2_IMAGE_COMPILER_VERSION,
      modelKey: NANO_BANANA_2_MODEL_KEY,
      profileId: NANO_BANANA_2_CAPABILITY_PROFILE_ID,
      profileVersion: NANO_BANANA_2_CAPABILITY_PROFILE_VERSION,
    },
    {
      compile: ({ brief, modelKey }) =>
        compileNanoBanana2GenerationBrief({ brief, modelKey }),
      compilerId: NANO_BANANA_2_IMAGE_COMPILER_ID,
      compilerVersion: NANO_BANANA_2_IMAGE_COMPILER_VERSION,
      modelKey: NANO_BANANA_2_LITE_MODEL_KEY,
      profileId: NANO_BANANA_2_LITE_CAPABILITY_PROFILE_ID,
      profileVersion: NANO_BANANA_2_CAPABILITY_PROFILE_VERSION,
    },
    {
      compile: ({ brief, modelKey }) =>
        compileSeedream4GenerationBrief({ brief, modelKey }),
      compilerId: SEEDREAM_4_IMAGE_COMPILER_ID,
      compilerVersion: SEEDREAM_4_IMAGE_COMPILER_VERSION,
      modelKey: SEEDREAM_4_MODEL_KEY,
      profileId: SEEDREAM_4_CAPABILITY_PROFILE_ID,
      profileVersion: SEEDREAM_4_CAPABILITY_PROFILE_VERSION,
    },
    {
      compile: ({ brief, modelKey }) =>
        compileSeedream45GenerationBrief({ brief, modelKey }),
      compilerId: SEEDREAM_4_5_IMAGE_COMPILER_ID,
      compilerVersion: SEEDREAM_4_5_IMAGE_COMPILER_VERSION,
      modelKey: SEEDREAM_4_5_MODEL_KEY,
      profileId: SEEDREAM_4_5_CAPABILITY_PROFILE_ID,
      profileVersion: SEEDREAM_4_5_CAPABILITY_PROFILE_VERSION,
    },
    {
      compile: ({ brief, modelKey }) =>
        compileSeedream45GenerationBrief({ brief, modelKey }),
      compilerId: SEEDREAM_4_5_IMAGE_COMPILER_ID,
      compilerVersion: SEEDREAM_4_5_IMAGE_COMPILER_VERSION,
      modelKey: SEEDREAM_5_LITE_MODEL_KEY,
      profileId: SEEDREAM_5_LITE_CAPABILITY_PROFILE_ID,
      profileVersion: SEEDREAM_4_5_CAPABILITY_PROFILE_VERSION,
    },
    {
      compile: ({ brief, modelKey }) =>
        compileSeedream5ProGenerationBrief({ brief, modelKey }),
      compilerId: SEEDREAM_5_PRO_IMAGE_COMPILER_ID,
      compilerVersion: SEEDREAM_5_PRO_IMAGE_COMPILER_VERSION,
      modelKey: SEEDREAM_5_PRO_MODEL_KEY,
      profileId: SEEDREAM_5_PRO_CAPABILITY_PROFILE_ID,
      profileVersion: SEEDREAM_5_PRO_CAPABILITY_PROFILE_VERSION,
    },
    {
      compile: ({ brief, modelKey, seed }) =>
        compileQwenImageGenerationBrief({ brief, modelKey, seed }),
      compilerId: QWEN_IMAGE_IMAGE_COMPILER_ID,
      compilerVersion: QWEN_IMAGE_IMAGE_COMPILER_VERSION,
      modelKey: QWEN_IMAGE_MODEL_KEY,
      profileId: QWEN_IMAGE_CAPABILITY_PROFILE_ID,
      profileVersion: QWEN_IMAGE_CAPABILITY_PROFILE_VERSION,
    },
    {
      compile: ({ brief, modelKey, seed }) =>
        compileRunwayGen4ImageTurboGenerationBrief({ brief, modelKey, seed }),
      compilerId: RUNWAY_GEN4_IMAGE_TURBO_IMAGE_COMPILER_ID,
      compilerVersion: RUNWAY_GEN4_IMAGE_TURBO_IMAGE_COMPILER_VERSION,
      modelKey: RUNWAY_GEN4_IMAGE_TURBO_MODEL_KEY,
      profileId: RUNWAY_GEN4_IMAGE_TURBO_CAPABILITY_PROFILE_ID,
      profileVersion: RUNWAY_GEN4_IMAGE_TURBO_CAPABILITY_PROFILE_VERSION,
    },
    ...REMAINING_IMAGE_GENERATION_BRIEF_FAMILIES.flatMap((family) =>
      family.profiles.map((profile) => ({
        compile: ({
          brief,
          modelKey,
          seed,
        }: ImageGenerationBriefCompileInput) =>
          compileRemainingImageGenerationBrief({
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

export const IMAGE_GENERATION_BRIEF_REGISTRY: ReadonlyMap<
  string,
  ImageGenerationBriefRegistryEntry
> = new Map(
  IMAGE_GENERATION_BRIEF_REGISTRY_ENTRIES.map((entry) => [
    entry.modelKey,
    entry,
  ]),
);

export function getImageGenerationBriefRegistryEntry(
  modelKey: string,
): ImageGenerationBriefRegistryEntry | undefined {
  return IMAGE_GENERATION_BRIEF_REGISTRY.get(modelKey);
}

/**
 * Every remaining selectable image model key that is not brief-compiled,
 * mapped to its specific, enumerated exemption reason. A model key that is
 * neither here nor in the compile registry is a data-integrity bug — see
 * `resolveImageGenerationBriefSupport`, which throws rather than silently
 * defaulting.
 */
const IMAGE_GENERATION_BRIEF_EXEMPTION_ENTRIES: ReadonlyArray<
  readonly [string, GenerationBriefExemptionReason]
> = [
  // Non-generative transforms: these mutate or upscale an existing image
  // rather than generating one from a brief.
  [MODEL_KEYS.FAL_FACE_SWAP, 'non_generative_transform'],
  [MODEL_KEYS.FAL_UPSCALER, 'non_generative_transform'],
  [MODEL_KEYS.REPLICATE_TOPAZ_IMAGE_UPSCALE, 'non_generative_transform'],
  [MODEL_KEYS.REPLICATE_LUMA_REFRAME_IMAGE, 'non_generative_transform'],
  // Model training operations: these train a model rather than generate
  // an image.
  [MODEL_KEYS.REPLICATE_FAST_FLUX_TRAINER, 'model_training_operation'],
];

export const IMAGE_GENERATION_BRIEF_EXEMPTIONS: ReadonlyMap<
  string,
  GenerationBriefExemptionReason
> = new Map(IMAGE_GENERATION_BRIEF_EXEMPTION_ENTRIES);

export function getImageGenerationBriefExemptionReason(
  modelKey: string,
): GenerationBriefExemptionReason | undefined {
  return IMAGE_GENERATION_BRIEF_EXEMPTIONS.get(modelKey);
}
