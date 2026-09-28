import type { ModerationCategory } from '@genfeedai/contracts';
import {
  DEFAULT_MODERATION_THRESHOLDS,
  type MediaGateMode,
} from '@genfeedai/contracts/api-types/contracts';
import type {
  IPlatformFeatureSettings,
  ModerationProviderName,
} from '@genfeedai/contracts/interfaces';

export interface ModerationSettings {
  mode: MediaGateMode;
  provider: ModerationProviderName;
  thresholds: Readonly<Record<ModerationCategory, number>>;
}

/**
 * The moderation switches (#4880) as the classifier reads them: operator
 * the `moderation` PostHog flag (#5468), with per-category overrides over the
 * contract defaults.
 */
export function resolveModerationSettings(
  settings: IPlatformFeatureSettings,
): ModerationSettings {
  return {
    mode: settings.moderationMode,
    provider: settings.moderationProvider,
    thresholds: {
      ...DEFAULT_MODERATION_THRESHOLDS,
      ...settings.moderationThresholds,
    },
  };
}
