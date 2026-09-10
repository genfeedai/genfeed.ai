import {
  type ImageModelCapability,
  MODEL_OUTPUT_CAPABILITIES,
} from '@genfeedai/contracts/constants';

export interface ImageQualityOption {
  label: string;
  value: string;
}

const QUALITY_LABELS: Record<string, string> = {
  auto: 'Auto',
  high: 'High',
  low: 'Low',
  max: 'Max',
  medium: 'Medium',
  xhigh: 'Extra high',
};

function imageCapability(modelKey: string): ImageModelCapability | null {
  const capability = MODEL_OUTPUT_CAPABILITIES[modelKey];
  if (capability?.category !== 'image') {
    return null;
  }

  return capability;
}

export function getImageQualityOptionsByModel(
  modelKey: string,
): ImageQualityOption[] {
  const options = imageCapability(modelKey)?.qualityOptions ?? [];

  return options.map((value) => ({
    label: QUALITY_LABELS[value] ?? value,
    value,
  }));
}

export function getDefaultImageQuality(modelKey: string): string | undefined {
  return imageCapability(modelKey)?.defaultQuality;
}

export function isImageQualitySupported(
  modelKey: string,
  quality: string | undefined,
): boolean {
  if (!quality) {
    return false;
  }

  return imageCapability(modelKey)?.qualityOptions?.includes(quality) === true;
}
