import { LLM_DEFAULTS } from '@genfeedai/contracts/constants';
import type { IPlatformFeatureSettings } from '@genfeedai/contracts/interfaces';

export interface MediaPerceptionSettings {
  frameCount: number;
  isEnabled: boolean;
  lookbackHours: number;
  visionModel: string;
}

/**
 * The media perception switches (#4879) as the perception pipeline reads
 * them. They are the `media_perception` PostHog flag (#5468); the flags are already
 * parsed fail-closed, so only the vision-model fallback is resolved here.
 */
export function resolveMediaPerceptionSettings(
  settings: IPlatformFeatureSettings,
): MediaPerceptionSettings {
  return {
    frameCount: settings.mediaPerceptionFrameCount,
    isEnabled: settings.isMediaPerceptionEnabled,
    lookbackHours: settings.mediaPerceptionLookbackHours,
    visionModel: settings.mediaPerceptionVisionModel ?? LLM_DEFAULTS.fastText,
  };
}
