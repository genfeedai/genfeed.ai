import { ModelKey } from '@genfeedai/enums';

export interface VideoModelResolution {
  model: string;
  resolutions: Array<{
    value: string;
    label: string;
  }>;
  default: string;
}

export const videoModelResolutions: VideoModelResolution[] = [
  {
    default: '1080p',
    model: ModelKey.REPLICATE_GOOGLE_VEO_3,
    resolutions: [
      { label: '720p', value: '720p' },
      { label: '1080p', value: '1080p' },
    ],
  },
  {
    default: '1080p',
    model: ModelKey.REPLICATE_GOOGLE_VEO_3_FAST,
    resolutions: [
      { label: '720p', value: '720p' },
      { label: '1080p', value: '1080p' },
    ],
  },
  {
    default: '1080p',
    model: ModelKey.REPLICATE_GOOGLE_VEO_3_1,
    resolutions: [
      { label: '720p', value: '720p' },
      { label: '1080p', value: '1080p' },
    ],
  },
  {
    default: '1080p',
    model: ModelKey.REPLICATE_GOOGLE_VEO_3_1_FAST,
    resolutions: [
      { label: '720p', value: '720p' },
      { label: '1080p', value: '1080p' },
    ],
  },
  {
    default: 'high',
    model: ModelKey.REPLICATE_OPENAI_SORA_2_PRO,
    resolutions: [
      { label: '720p', value: 'standard' },
      { label: '1080p', value: 'high' },
    ],
  },
  {
    default: '720p',
    model: ModelKey.REPLICATE_WAN_VIDEO_WAN_2_2_I2V_FAST,
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
): Array<{ value: string; label: string }> {
  return findModelConfig(model)?.resolutions ?? [];
}

export function getDefaultVideoResolution(model: string): string | undefined {
  return findModelConfig(model)?.default;
}

export function hasResolutionOptions(model: string): boolean {
  return findModelConfig(model) !== undefined;
}
