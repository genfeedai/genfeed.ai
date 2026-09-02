import {
  FAL_FLUX_2_PRO_IMAGE_COMPILER_ID,
  FAL_FLUX_IMAGE_COMPILER_ID,
  FAL_NANO_BANANA_2_IMAGE_COMPILER_ID,
  GENFEED_FLUX_IMAGE_COMPILER_ID,
  GENFEED_PULID_IMAGE_COMPILER_ID,
  GPT_IMAGE_IMAGE_COMPILER_ID,
  GROK_IMAGINE_IMAGE_COMPILER_ID,
  HIGGSFIELD_SOUL_IMAGE_COMPILER_ID,
  LEONARDO_IMAGE_COMPILER_ID,
  RECRAFT_IMAGE_COMPILER_ID,
  REMAINING_IMAGE_COMPILER_VERSION,
  SDXL_IMAGE_COMPILER_ID,
  Z_IMAGE_TURBO_IMAGE_COMPILER_ID,
} from '@genfeedai/contracts/api-types/contracts/generation-brief-compiler.contract';
import {
  buildRemainingImageCapabilityProfile,
  type RemainingImageCapabilityProfile,
} from '@genfeedai/contracts/api-types/contracts/generation-capability-profile-remaining.contract';
import { MODEL_KEYS } from '@genfeedai/contracts/constants';

export interface RemainingImageFamilyDispatchSpec {
  aspectRatioField?: 'aspect_ratio';
  extraDefaults?: Record<string, boolean | number | string>;
  modelLabel: string;
  negativePromptField?: 'negative_prompt';
  referenceField?:
    | 'id_image'
    | 'image'
    | 'image_input'
    | 'input_images'
    | 'reference_images';
  referenceFieldIsArray?: boolean;
}

export interface RemainingImageGenerationBriefFamily {
  compilerId: string;
  compilerVersion: number;
  profiles: readonly RemainingImageCapabilityProfile[];
  requireReference?: boolean;
  spec: RemainingImageFamilyDispatchSpec;
}

function profile(
  id: string,
  modelKey: string,
  maxReferences: number,
  extras?: {
    defaultAspectRatio?: string;
    nativeFields?: string[];
    negativePromptSupported?: boolean;
    seedSupported?: boolean;
  },
): RemainingImageCapabilityProfile {
  return buildRemainingImageCapabilityProfile({
    defaultAspectRatio: extras?.defaultAspectRatio,
    id,
    maxReferences,
    modelKey,
    nativeFields: extras?.nativeFields,
    negativePromptSupported: extras?.negativePromptSupported,
    seedSupported: extras?.seedSupported,
  });
}

export const REMAINING_IMAGE_GENERATION_BRIEF_FAMILIES: readonly RemainingImageGenerationBriefFamily[] =
  [
    {
      compilerId: GPT_IMAGE_IMAGE_COMPILER_ID,
      compilerVersion: REMAINING_IMAGE_COMPILER_VERSION,
      profiles: [
        profile(
          'gpt-image-1-5-capability',
          MODEL_KEYS.REPLICATE_OPENAI_GPT_IMAGE_1_5,
          4,
          {
            nativeFields: ['input_images'],
            seedSupported: false,
          },
        ),
        profile(
          'gpt-image-2-capability',
          MODEL_KEYS.REPLICATE_OPENAI_GPT_IMAGE_2,
          10,
          {
            nativeFields: ['input_images'],
            seedSupported: false,
          },
        ),
        profile('fal-gpt-image-2-capability', MODEL_KEYS.FAL_GPT_IMAGE_2, 10, {
          nativeFields: ['input_images'],
          seedSupported: false,
        }),
      ],
      spec: {
        aspectRatioField: 'aspect_ratio',
        modelLabel: 'GPT Image',
        referenceField: 'input_images',
        referenceFieldIsArray: true,
      },
    },
    {
      compilerId: RECRAFT_IMAGE_COMPILER_ID,
      compilerVersion: REMAINING_IMAGE_COMPILER_VERSION,
      profiles: [
        profile(
          'recraft-v4-capability',
          MODEL_KEYS.REPLICATE_RECRAFT_AI_RECRAFT_V4,
          1,
          {
            nativeFields: ['image'],
          },
        ),
        profile(
          'recraft-v4-pro-capability',
          MODEL_KEYS.REPLICATE_RECRAFT_AI_RECRAFT_V4_PRO,
          1,
          {
            nativeFields: ['image'],
          },
        ),
        profile(
          'fal-recraft-v4-pro-capability',
          MODEL_KEYS.FAL_RECRAFT_V4_PRO,
          1,
          {
            nativeFields: ['image'],
          },
        ),
      ],
      spec: {
        aspectRatioField: 'aspect_ratio',
        modelLabel: 'Recraft',
        referenceField: 'image',
      },
    },
    {
      compilerId: GROK_IMAGINE_IMAGE_COMPILER_ID,
      compilerVersion: REMAINING_IMAGE_COMPILER_VERSION,
      profiles: [
        profile(
          'grok-imagine-image-capability',
          MODEL_KEYS.REPLICATE_XAI_GROK_IMAGINE_IMAGE,
          1,
          { nativeFields: ['image'] },
        ),
      ],
      spec: {
        aspectRatioField: 'aspect_ratio',
        modelLabel: 'Grok Imagine Image',
        referenceField: 'image',
      },
    },
    {
      compilerId: SDXL_IMAGE_COMPILER_ID,
      compilerVersion: REMAINING_IMAGE_COMPILER_VERSION,
      profiles: [
        profile('sdxl-capability', MODEL_KEYS.SDXL, 1, {
          nativeFields: ['image'],
          negativePromptSupported: true,
        }),
      ],
      spec: {
        aspectRatioField: 'aspect_ratio',
        modelLabel: 'SDXL',
        negativePromptField: 'negative_prompt',
        referenceField: 'image',
      },
    },
    {
      compilerId: LEONARDO_IMAGE_COMPILER_ID,
      compilerVersion: REMAINING_IMAGE_COMPILER_VERSION,
      profiles: [
        profile('leonardo-capability', MODEL_KEYS.LEONARDOAI, 1, {
          nativeFields: ['image'],
        }),
      ],
      spec: {
        aspectRatioField: 'aspect_ratio',
        modelLabel: 'Leonardo',
        referenceField: 'image',
      },
    },
    {
      compilerId: HIGGSFIELD_SOUL_IMAGE_COMPILER_ID,
      compilerVersion: REMAINING_IMAGE_COMPILER_VERSION,
      profiles: [
        profile('higgsfield-soul-capability', MODEL_KEYS.HIGGSFIELD_SOUL, 1, {
          defaultAspectRatio: '9:16',
          nativeFields: ['image'],
        }),
      ],
      spec: {
        aspectRatioField: 'aspect_ratio',
        modelLabel: 'Higgsfield Soul',
        referenceField: 'image',
      },
    },
    {
      compilerId: FAL_FLUX_IMAGE_COMPILER_ID,
      compilerVersion: REMAINING_IMAGE_COMPILER_VERSION,
      profiles: [
        profile('fal-flux-schnell-capability', MODEL_KEYS.FAL_FLUX_SCHNELL, 0),
        profile('fal-flux-dev-capability', MODEL_KEYS.FAL_FLUX_DEV, 1, {
          nativeFields: ['image'],
        }),
        profile('fal-flux-pro-capability', MODEL_KEYS.FAL_FLUX_PRO, 0),
      ],
      spec: {
        aspectRatioField: 'aspect_ratio',
        extraDefaults: { num_inference_steps: 4, output_format: 'jpeg' },
        modelLabel: 'Fal FLUX',
        referenceField: 'image',
      },
    },
    {
      compilerId: FAL_FLUX_2_PRO_IMAGE_COMPILER_ID,
      compilerVersion: REMAINING_IMAGE_COMPILER_VERSION,
      profiles: [
        profile('fal-flux-2-pro-capability', MODEL_KEYS.FAL_FLUX_2_PRO, 8, {
          nativeFields: ['input_images'],
        }),
      ],
      spec: {
        aspectRatioField: 'aspect_ratio',
        modelLabel: 'Fal FLUX 2 Pro',
        referenceField: 'input_images',
        referenceFieldIsArray: true,
      },
    },
    {
      compilerId: FAL_NANO_BANANA_2_IMAGE_COMPILER_ID,
      compilerVersion: REMAINING_IMAGE_COMPILER_VERSION,
      profiles: [
        profile(
          'fal-nano-banana-2-capability',
          MODEL_KEYS.FAL_NANO_BANANA_2,
          14,
          {
            nativeFields: ['image_input'],
          },
        ),
      ],
      spec: {
        modelLabel: 'Fal Nano Banana 2',
        referenceField: 'image_input',
        referenceFieldIsArray: true,
      },
    },
    {
      compilerId: GENFEED_FLUX_IMAGE_COMPILER_ID,
      compilerVersion: REMAINING_IMAGE_COMPILER_VERSION,
      profiles: [
        profile(
          'genfeed-flux-dev-capability',
          MODEL_KEYS.GENFEED_AI_FLUX_DEV,
          0,
        ),
        profile(
          'genfeed-flux2-dev-capability',
          MODEL_KEYS.GENFEED_AI_FLUX2_DEV,
          0,
        ),
        profile(
          'genfeed-flux2-klein-capability',
          MODEL_KEYS.GENFEED_AI_FLUX2_KLEIN,
          0,
        ),
      ],
      spec: {
        aspectRatioField: 'aspect_ratio',
        modelLabel: 'Genfeed FLUX',
      },
    },
    {
      compilerId: GENFEED_PULID_IMAGE_COMPILER_ID,
      compilerVersion: REMAINING_IMAGE_COMPILER_VERSION,
      profiles: [
        profile(
          'genfeed-flux-dev-pulid-capability',
          MODEL_KEYS.GENFEED_AI_FLUX_DEV_PULID,
          1,
          {
            nativeFields: ['id_image'],
          },
        ),
        profile(
          'genfeed-flux2-dev-pulid-capability',
          MODEL_KEYS.GENFEED_AI_FLUX2_DEV_PULID,
          1,
          {
            nativeFields: ['id_image'],
          },
        ),
        profile(
          'genfeed-flux2-dev-pulid-lora-capability',
          MODEL_KEYS.GENFEED_AI_FLUX2_DEV_PULID_LORA,
          1,
          { nativeFields: ['id_image'] },
        ),
        profile(
          'genfeed-flux2-dev-pulid-upscale-capability',
          MODEL_KEYS.GENFEED_AI_FLUX2_DEV_PULID_UPSCALE,
          1,
          { defaultAspectRatio: '4:5', nativeFields: ['id_image'] },
        ),
      ],
      requireReference: true,
      spec: {
        aspectRatioField: 'aspect_ratio',
        modelLabel: 'Genfeed PuLID',
        referenceField: 'id_image',
      },
    },
    {
      compilerId: Z_IMAGE_TURBO_IMAGE_COMPILER_ID,
      compilerVersion: REMAINING_IMAGE_COMPILER_VERSION,
      profiles: [
        profile(
          'z-image-turbo-capability',
          MODEL_KEYS.GENFEED_AI_Z_IMAGE_TURBO,
          0,
        ),
        profile(
          'z-image-turbo-lora-capability',
          MODEL_KEYS.GENFEED_AI_Z_IMAGE_TURBO_LORA,
          0,
          { defaultAspectRatio: '4:5' },
        ),
      ],
      spec: {
        aspectRatioField: 'aspect_ratio',
        modelLabel: 'Z-Image Turbo',
      },
    },
  ];
