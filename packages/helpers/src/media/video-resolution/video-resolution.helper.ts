import { MODEL_KEYS } from '@genfeedai/contracts/constants';

export interface VideoModelResolution {
  model: string;
  resolutions: Array<{
    isDraft?: boolean;
    value: string;
    label: string;
  }>;
  default: string;
}

export const videoModelResolutions: VideoModelResolution[] = [
  {
    default: '720p',
    model: MODEL_KEYS.REPLICATE_BYTEDANCE_SEEDANCE_2_5,
    resolutions: [
      { label: '480p', value: '480p' },
      { label: '720p', value: '720p' },
    ],
  },
  {
    default: '2K',
    model: MODEL_KEYS.REPLICATE_MINIMAX_H3,
    resolutions: [
      { label: '768P', value: '768P' },
      { label: '2K', value: '2K' },
    ],
  },
  {
    default: '768P',
    model: MODEL_KEYS.FAL_MINIMAX_H3_MAX,
    resolutions: [
      { label: '480P', value: '480P' },
      { label: '768P', value: '768P' },
    ],
  },
  {
    default: '720p',
    model: MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1_LITE,
    resolutions: [
      { label: '720p', value: '720p' },
      { label: '1080p', value: '1080p' },
    ],
  },
  {
    default: '720p',
    model: MODEL_KEYS.FAL_VEO_3_1,
    resolutions: [
      { label: '720p', value: '720p' },
      { label: '1080p', value: '1080p' },
    ],
  },
  {
    default: 'standard',
    model: MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V3_VIDEO,
    resolutions: [
      { label: '720p', value: 'standard' },
      { label: '1080p', value: 'pro' },
      { label: '4K', value: '4k' },
    ],
  },
  {
    default: 'standard',
    model: MODEL_KEYS.REPLICATE_KWAIVGI_KLING_V3_OMNI_VIDEO,
    resolutions: [
      { label: '720p', value: 'standard' },
      { label: '1080p', value: 'pro' },
      { label: '4K', value: '4k' },
    ],
  },
  {
    default: '1080p',
    model: MODEL_KEYS.REPLICATE_GOOGLE_VEO_3,
    resolutions: [
      { label: '720p', value: '720p' },
      { label: '1080p', value: '1080p' },
    ],
  },
  {
    default: '720p',
    model: MODEL_KEYS.REPLICATE_PRUNAAI_P_VIDEO,
    resolutions: [
      { label: '720p', value: '720p' },
      { label: '1080p', value: '1080p' },
    ],
  },
  {
    default: '720p',
    model: MODEL_KEYS.REPLICATE_XAI_GROK_IMAGINE_VIDEO,
    resolutions: [
      { label: '480p', value: '480p' },
      { label: '720p', value: '720p' },
    ],
  },
  {
    default: '768p',
    model: MODEL_KEYS.REPLICATE_MINIMAX_HAILUO_2_3,
    resolutions: [
      { label: '768p', value: '768p' },
      { label: '1080p', value: '1080p' },
    ],
  },
  {
    default: '768p',
    model: MODEL_KEYS.REPLICATE_MINIMAX_HAILUO_2_3_FAST,
    resolutions: [
      { label: '768p', value: '768p' },
      { label: '1080p', value: '1080p' },
    ],
  },
  {
    default: '720p',
    model: MODEL_KEYS.REPLICATE_VIDU_Q3_PRO,
    resolutions: [
      { label: '720p', value: '720p' },
      { label: '1080p', value: '1080p' },
    ],
  },
  {
    default: '720p',
    model: MODEL_KEYS.REPLICATE_VIDU_Q3_TURBO,
    resolutions: [
      { label: '720p', value: '720p' },
      { label: '1080p', value: '1080p' },
    ],
  },
  {
    default: '1080p',
    model: MODEL_KEYS.REPLICATE_WAN_VIDEO_WAN_2_7_T2V,
    resolutions: [
      { label: '720p', value: '720p' },
      { label: '1080p', value: '1080p' },
    ],
  },
  {
    default: '1080p',
    model: MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_FAST,
    resolutions: [
      { label: '720p', value: '720p' },
      { label: '1080p', value: '1080p' },
    ],
  },
  {
    default: '1080p',
    model: MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1,
    resolutions: [
      { label: '720p', value: '720p' },
      { label: '1080p', value: '1080p' },
    ],
  },
  {
    default: '1080p',
    model: MODEL_KEYS.REPLICATE_GOOGLE_VEO_3_1_FAST,
    resolutions: [
      { label: '720p', value: '720p' },
      { label: '1080p', value: '1080p' },
    ],
  },
  {
    default: 'high',
    model: MODEL_KEYS.REPLICATE_OPENAI_SORA_2_PRO,
    resolutions: [
      { label: '720p', value: 'standard' },
      { label: '1080p', value: 'high' },
    ],
  },
  {
    default: '720p',
    model: MODEL_KEYS.REPLICATE_WAN_VIDEO_WAN_2_2_I2V_FAST,
    resolutions: [
      { label: '480p', value: '480p' },
      { label: '720p', value: '720p' },
    ],
  },
];

function findModelConfig(model: string): VideoModelResolution | undefined {
  return videoModelResolutions.find((config) => config.model === model);
}

export function getVideoResolutionsByModel(
  model: string,
): Array<{ isDraft?: boolean; value: string; label: string }> {
  const resolutions = findModelConfig(model)?.resolutions ?? [];
  return resolutions.map((resolution, index) =>
    index === 0
      ? {
          ...resolution,
          isDraft: true,
          label: `${resolution.label} · Draft`,
        }
      : { ...resolution },
  );
}

export function getVideoResolutionLabel(
  model: string,
  value: string,
): string | undefined {
  return findModelConfig(model)?.resolutions.find(
    (resolution) => resolution.value === value,
  )?.label;
}

export function getDefaultVideoResolution(model: string): string | undefined {
  return findModelConfig(model)?.default;
}

export function hasResolutionOptions(model: string): boolean {
  return findModelConfig(model) !== undefined;
}
