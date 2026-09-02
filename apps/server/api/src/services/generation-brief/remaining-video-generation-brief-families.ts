import {
  FAL_STABLE_VIDEO_COMPILER_ID,
  GEMINI_OMNI_VIDEO_COMPILER_ID,
  GROK_IMAGINE_VIDEO_COMPILER_ID,
  H3_MAX_VIDEO_COMPILER_ID,
  HAILUO_VIDEO_COMPILER_ID,
  KLING_VIDEO_COMPILER_ID,
  LUMA_VIDEO_COMPILER_ID,
  PIXVERSE_VIDEO_COMPILER_ID,
  REMAINING_VIDEO_COMPILER_VERSION,
  RUNWAY_VIDEO_COMPILER_ID,
  SEEDANCE_VIDEO_COMPILER_ID,
  SORA_VIDEO_COMPILER_ID,
  VEO_VIDEO_COMPILER_ID,
  VIDU_VIDEO_COMPILER_ID,
  WAN_VIDEO_COMPILER_ID,
} from '@api-types/contracts/video-generation-brief-compiler.contract';
import {
  buildRemainingVideoCapabilityProfile,
  type RemainingVideoCapabilityProfile,
} from '@api-types/contracts/video-generation-capability-profile-remaining.contract';
import { ASPECT_RATIOS, MODEL_KEYS } from '@genfeedai/constants';
import { getDefaultVideoResolution } from '@genfeedai/helpers/media/video-resolution/video-resolution.helper';

export interface RemainingVideoFamilyDispatchSpec {
  aspectRatioField?: 'aspect_ratio' | 'ratio';
  durationField?: 'duration' | 'seconds';
  extraDefaults?: Record<string, boolean | number | string>;
  firstFrameField?: 'image' | 'image_url' | 'input_reference' | 'start_image';
  lastFrameField?:
    | 'end_image'
    | 'end_image_url'
    | 'last_frame'
    | 'last_frame_image'
    | 'last_image';
  modelLabel: string;
  negativePromptField?: 'negative_prompt';
  extraReferenceField?: 'image_urls' | 'reference_images';
  resolutionField?: 'mode' | 'resolution';
  videoReferenceField?: 'reference_video' | 'reference_videos';
}

export interface RemainingVideoGenerationBriefFamily {
  compilerId: string;
  compilerVersion: number;
  profiles: readonly RemainingVideoCapabilityProfile[];
  requireFirstFrame?: boolean;
  spec: RemainingVideoFamilyDispatchSpec;
}

function profile(
  id: string,
  modelKey: string,
  extras?: {
    aspectRatios?: readonly string[];
    audioSupported?: boolean;
    defaultAspectRatio?: string;
    defaultSeconds?: number;
    maxReferences?: number;
    maxVideoReferences?: number;
    maxSeconds?: number;
    minSeconds?: number;
    nativeFields?: string[];
    negativePromptSupported?: boolean;
    requireImageToVideo?: boolean;
    seedSupported?: boolean;
  },
): RemainingVideoCapabilityProfile {
  return buildRemainingVideoCapabilityProfile({
    aspectRatios: extras?.aspectRatios,
    audioSupported: extras?.audioSupported,
    defaultAspectRatio: extras?.defaultAspectRatio,
    defaultSeconds: extras?.defaultSeconds,
    defaultResolution: getDefaultVideoResolution(modelKey),
    id,
    maxReferences: extras?.maxReferences ?? 1,
    maxVideoReferences: extras?.maxVideoReferences,
    maxSeconds: extras?.maxSeconds,
    minSeconds: extras?.minSeconds,
    modelKey,
    nativeFields: extras?.nativeFields,
    negativePromptSupported: extras?.negativePromptSupported,
    requireImageToVideo: extras?.requireImageToVideo,
    seedSupported: extras?.seedSupported,
  });
}

export const REMAINING_VIDEO_GENERATION_BRIEF_FAMILIES: readonly RemainingVideoGenerationBriefFamily[] =
  [
    {
      compilerId: VEO_VIDEO_COMPILER_ID,
      compilerVersion: REMAINING_VIDEO_COMPILER_VERSION,
      profiles: [
        profile('veo-2-capability', MODEL_KEYS.REPLICATE_GOOGLE_VEO_2),
        profile('veo-3-capability', MODEL_KEYS.REPLICATE_GOOGLE_VEO_3, {
          audioSupported: true,
          negativePromptSupported: true,
        }),
        profile(
          'veo-3-fast-capability',
          MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_FAST,
          {
            audioSupported: true,
            negativePromptSupported: true,
          },
        ),
        profile('veo-3-1-capability', MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1, {
          audioSupported: true,
          maxReferences: 3,
          nativeFields: ['image', 'last_frame', 'reference_images'],
          negativePromptSupported: true,
        }),
        profile(
          'veo-3-1-fast-capability',
          MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1_FAST,
          {
            audioSupported: true,
            nativeFields: ['image', 'last_frame'],
            negativePromptSupported: true,
          },
        ),
        profile(
          'veo-3-1-lite-capability',
          MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1_LITE,
          {
            audioSupported: true,
            nativeFields: ['image'],
            negativePromptSupported: true,
          },
        ),
        profile('fal-veo-3-1-capability', MODEL_KEYS.FAL_VEO_3_1, {
          audioSupported: true,
          nativeFields: ['image'],
          negativePromptSupported: true,
        }),
      ],
      spec: {
        aspectRatioField: 'aspect_ratio',
        durationField: 'duration',
        extraReferenceField: 'reference_images',
        firstFrameField: 'image',
        lastFrameField: 'last_frame',
        modelLabel: 'Veo',
        negativePromptField: 'negative_prompt',
        resolutionField: 'resolution',
      },
    },
    {
      compilerId: SORA_VIDEO_COMPILER_ID,
      compilerVersion: REMAINING_VIDEO_COMPILER_VERSION,
      profiles: [
        profile('sora-2-capability', MODEL_KEYS.REPLICATE_OPENAI_SORA_2, {
          defaultSeconds: 8,
          maxSeconds: 12,
          nativeFields: ['input_reference'],
          seedSupported: false,
        }),
        profile(
          'sora-2-pro-capability',
          MODEL_KEYS.REPLICATE_OPENAI_SORA_2_PRO,
          {
            defaultSeconds: 8,
            maxSeconds: 12,
            nativeFields: ['input_reference'],
            seedSupported: false,
          },
        ),
      ],
      spec: {
        aspectRatioField: 'aspect_ratio',
        durationField: 'seconds',
        firstFrameField: 'input_reference',
        modelLabel: 'Sora',
        resolutionField: 'resolution',
      },
    },
    {
      compilerId: KLING_VIDEO_COMPILER_ID,
      compilerVersion: REMAINING_VIDEO_COMPILER_VERSION,
      profiles: [
        profile(
          'kling-v1-6-pro-capability',
          MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V1_6_PRO,
          {
            nativeFields: ['start_image', 'end_image', 'reference_images'],
            negativePromptSupported: true,
          },
        ),
        profile(
          'kling-v2-1-capability',
          MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V2_1,
          {
            nativeFields: ['start_image', 'end_image'],
            negativePromptSupported: true,
            requireImageToVideo: true,
          },
        ),
        profile(
          'kling-v2-1-master-capability',
          MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V2_1_MASTER,
          {
            nativeFields: ['start_image'],
            negativePromptSupported: true,
          },
        ),
        profile(
          'kling-v2-5-turbo-pro-capability',
          MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V2_5_TURBO_PRO,
          { nativeFields: ['start_image'], negativePromptSupported: true },
        ),
        profile(
          'kling-v2-6-capability',
          MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V2_6,
          {
            nativeFields: ['start_image'],
            negativePromptSupported: true,
          },
        ),
        profile(
          'kling-v3-video-capability',
          MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V3_VIDEO,
          {
            audioSupported: true,
            nativeFields: ['start_image', 'end_image'],
            negativePromptSupported: true,
          },
        ),
        profile(
          'kling-v3-omni-video-capability',
          MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V3_OMNI_VIDEO,
          {
            audioSupported: true,
            maxReferences: 7,
            maxVideoReferences: 1,
            nativeFields: [
              'start_image',
              'end_image',
              'reference_images',
              'reference_video',
            ],
            negativePromptSupported: true,
          },
        ),
        profile(
          'kling-avatar-v2-capability',
          MODEL_KEYS.REPLICATE_KWAIVGI_KLING_AVATAR_V2,
          {
            nativeFields: ['start_image'],
            requireImageToVideo: true,
          },
        ),
        profile('klingai-v2-capability', MODEL_KEYS.KLINGAI_V2, {
          nativeFields: ['start_image'],
        }),
        profile(
          'higgsfield-kling-video-capability',
          MODEL_KEYS.HIGGSFIELD_KLING_VIDEO,
          {
            defaultAspectRatio: '9:16',
            nativeFields: ['start_image'],
            requireImageToVideo: true,
          },
        ),
        profile('fal-kling-video-capability', MODEL_KEYS.FAL_KLING_VIDEO, {
          nativeFields: ['start_image', 'end_image'],
        }),
        profile(
          'fal-kling-video-v3-pro-capability',
          MODEL_KEYS.FAL_KLING_VIDEO_V3_PRO,
          {
            audioSupported: true,
            nativeFields: ['start_image'],
          },
        ),
      ],
      spec: {
        aspectRatioField: 'aspect_ratio',
        durationField: 'duration',
        extraReferenceField: 'reference_images',
        firstFrameField: 'start_image',
        lastFrameField: 'end_image',
        modelLabel: 'Kling',
        negativePromptField: 'negative_prompt',
        resolutionField: 'mode',
        videoReferenceField: 'reference_video',
      },
    },
    {
      compilerId: WAN_VIDEO_COMPILER_ID,
      compilerVersion: REMAINING_VIDEO_COMPILER_VERSION,
      profiles: [
        profile(
          'wan-2-2-i2v-fast-capability',
          MODEL_KEYS.REPLICATE_WAN_VIDEO_WAN_2_2_I2V_FAST,
          {
            nativeFields: ['image', 'last_image'],
            requireImageToVideo: true,
          },
        ),
        profile(
          'wan-2-7-t2v-capability',
          MODEL_KEYS.REPLICATE_WAN_VIDEO_WAN_2_7_T2V,
          {
            nativeFields: ['image'],
          },
        ),
      ],
      spec: {
        aspectRatioField: 'aspect_ratio',
        durationField: 'duration',
        firstFrameField: 'image',
        lastFrameField: 'last_image',
        modelLabel: 'Wan',
        resolutionField: 'resolution',
      },
    },
    {
      compilerId: SEEDANCE_VIDEO_COMPILER_ID,
      compilerVersion: REMAINING_VIDEO_COMPILER_VERSION,
      profiles: [
        profile(
          'seedance-2-0-capability',
          MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_0,
          {
            audioSupported: true,
            nativeFields: ['image', 'reference_videos'],
          },
        ),
        profile(
          'seedance-2-0-fast-capability',
          MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_0_FAST,
          {
            audioSupported: true,
            nativeFields: ['image', 'reference_videos'],
          },
        ),
        profile(
          'seedance-2-5-capability',
          MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_5,
          {
            audioSupported: true,
            maxReferences: 30,
            maxVideoReferences: 10,
            nativeFields: ['image', 'last_frame_image', 'reference_videos'],
          },
        ),
        profile('fal-seedance-2-0-capability', MODEL_KEYS.FAL_SEEDANCE_2_0, {
          audioSupported: true,
          nativeFields: ['image', 'reference_videos'],
        }),
      ],
      spec: {
        aspectRatioField: 'aspect_ratio',
        durationField: 'duration',
        firstFrameField: 'image',
        lastFrameField: 'last_frame_image',
        modelLabel: 'Seedance',
        resolutionField: 'resolution',
        videoReferenceField: 'reference_videos',
      },
    },
    {
      compilerId: HAILUO_VIDEO_COMPILER_ID,
      compilerVersion: REMAINING_VIDEO_COMPILER_VERSION,
      profiles: [
        profile(
          'hailuo-2-3-capability',
          MODEL_KEYS.REPLICATE_MINIMAX_HAILUO_2_3,
          {
            nativeFields: ['image'],
          },
        ),
        profile(
          'hailuo-2-3-fast-capability',
          MODEL_KEYS.REPLICATE_MINIMAX_HAILUO_2_3_FAST,
          {
            nativeFields: ['image'],
            requireImageToVideo: true,
          },
        ),
      ],
      spec: {
        aspectRatioField: 'aspect_ratio',
        durationField: 'duration',
        firstFrameField: 'image',
        modelLabel: 'Hailuo',
        resolutionField: 'resolution',
      },
    },
    {
      compilerId: VIDU_VIDEO_COMPILER_ID,
      compilerVersion: REMAINING_VIDEO_COMPILER_VERSION,
      profiles: [
        profile('vidu-q3-pro-capability', MODEL_KEYS.REPLICATE_VIDU_Q3_PRO, {
          nativeFields: ['start_image', 'end_image'],
        }),
        profile(
          'vidu-q3-turbo-capability',
          MODEL_KEYS.REPLICATE_VIDU_Q3_TURBO,
          {
            nativeFields: ['start_image', 'end_image'],
          },
        ),
      ],
      spec: {
        aspectRatioField: 'aspect_ratio',
        durationField: 'duration',
        firstFrameField: 'start_image',
        lastFrameField: 'end_image',
        modelLabel: 'Vidu',
        resolutionField: 'resolution',
      },
    },
    {
      compilerId: PIXVERSE_VIDEO_COMPILER_ID,
      compilerVersion: REMAINING_VIDEO_COMPILER_VERSION,
      profiles: [
        profile(
          'pixverse-v6-capability',
          MODEL_KEYS.REPLICATE_PIXVERSE_PIXVERSE_V6,
          {
            nativeFields: ['image'],
          },
        ),
        profile('fal-pixverse-v6-capability', MODEL_KEYS.FAL_PIXVERSE_V6, {
          nativeFields: ['image'],
        }),
      ],
      spec: {
        aspectRatioField: 'aspect_ratio',
        durationField: 'duration',
        firstFrameField: 'image',
        modelLabel: 'Pixverse',
      },
    },
    {
      compilerId: GROK_IMAGINE_VIDEO_COMPILER_ID,
      compilerVersion: REMAINING_VIDEO_COMPILER_VERSION,
      profiles: [
        profile(
          'grok-imagine-video-capability',
          MODEL_KEYS.REPLICATE_XAI_GROK_IMAGINE_VIDEO,
          { nativeFields: ['image'] },
        ),
      ],
      spec: {
        aspectRatioField: 'aspect_ratio',
        durationField: 'duration',
        firstFrameField: 'image',
        modelLabel: 'Grok Imagine Video',
        resolutionField: 'resolution',
      },
    },
    {
      compilerId: RUNWAY_VIDEO_COMPILER_ID,
      compilerVersion: REMAINING_VIDEO_COMPILER_VERSION,
      profiles: [
        profile(
          'runway-gen-4-5-capability',
          MODEL_KEYS.REPLICATE_RUNWAYML_GEN_4_5,
          {
            nativeFields: ['image'],
          },
        ),
        profile('fal-runway-gen3-capability', MODEL_KEYS.FAL_RUNWAY_GEN3, {
          nativeFields: ['image'],
        }),
        profile('runwayml-capability', MODEL_KEYS.RUNWAYML, {
          nativeFields: ['image'],
        }),
      ],
      spec: {
        aspectRatioField: 'aspect_ratio',
        durationField: 'duration',
        firstFrameField: 'image',
        modelLabel: 'Runway',
      },
    },
    {
      compilerId: LUMA_VIDEO_COMPILER_ID,
      compilerVersion: REMAINING_VIDEO_COMPILER_VERSION,
      profiles: [
        profile(
          'fal-luma-dream-machine-capability',
          MODEL_KEYS.FAL_LUMA_DREAM_MACHINE,
          {
            nativeFields: ['image'],
          },
        ),
      ],
      spec: {
        aspectRatioField: 'aspect_ratio',
        durationField: 'duration',
        firstFrameField: 'image',
        modelLabel: 'Luma Dream Machine',
      },
    },
    {
      compilerId: GEMINI_OMNI_VIDEO_COMPILER_ID,
      compilerVersion: REMAINING_VIDEO_COMPILER_VERSION,
      profiles: [
        profile(
          'fal-google-gemini-omni-flash-capability',
          MODEL_KEYS.FAL_GOOGLE_GEMINI_OMNI_FLASH,
          {
            aspectRatios: ASPECT_RATIOS.VEO,
            audioSupported: true,
            defaultSeconds: 8,
            maxReferences: 3,
            maxSeconds: 10,
            minSeconds: 3,
            nativeFields: ['image_url', 'image_urls'],
            seedSupported: false,
          },
        ),
      ],
      spec: {
        aspectRatioField: 'aspect_ratio',
        durationField: 'duration',
        extraReferenceField: 'image_urls',
        firstFrameField: 'image_url',
        modelLabel: 'Gemini Omni Flash',
      },
    },
    {
      compilerId: H3_MAX_VIDEO_COMPILER_ID,
      compilerVersion: REMAINING_VIDEO_COMPILER_VERSION,
      profiles: [
        profile(
          'fal-minimax-h3-max-capability',
          MODEL_KEYS.FAL_MINIMAX_H3_MAX,
          {
            aspectRatios: ASPECT_RATIOS.H3_MAX,
            audioSupported: true,
            defaultSeconds: 5,
            maxReferences: 1,
            maxSeconds: 15,
            minSeconds: 5,
            nativeFields: ['image_url', 'end_image_url'],
            seedSupported: true,
          },
        ),
      ],
      spec: {
        aspectRatioField: 'aspect_ratio',
        durationField: 'duration',
        extraDefaults: {
          enable_safety_checker: true,
          prompt_expansion_mode: 'balanced',
        },
        firstFrameField: 'image_url',
        lastFrameField: 'end_image_url',
        modelLabel: 'MiniMax H3 Max',
        resolutionField: 'resolution',
      },
    },
    {
      compilerId: FAL_STABLE_VIDEO_COMPILER_ID,
      compilerVersion: REMAINING_VIDEO_COMPILER_VERSION,
      profiles: [
        profile('fal-stable-video-capability', MODEL_KEYS.FAL_STABLE_VIDEO, {
          nativeFields: ['image'],
          requireImageToVideo: true,
        }),
      ],
      requireFirstFrame: true,
      spec: {
        aspectRatioField: 'aspect_ratio',
        durationField: 'duration',
        firstFrameField: 'image',
        modelLabel: 'Stable Video',
      },
    },
  ];
