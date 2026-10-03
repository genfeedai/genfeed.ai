import type { PlatformSettingsService } from '@api/collections/platform-settings/services/platform-settings.service';
import { DEFAULT_PLATFORM_FEATURE_SETTINGS } from '@genfeedai/contracts/constants';
import type { IPlatformFeatureSettings } from '@genfeedai/contracts/interfaces';

/** Keeps existing provider fixtures while their configuration moves to admin. */
export function runtimeSettingsMock(config?: {
  get(key: string): unknown;
}): PlatformSettingsService {
  const mappings: Record<string, keyof IPlatformFeatureSettings> = {
    STRIPE_PAYG_CREDITS: 'paygFallbackCredits',
    LINKEDIN_TREND_SOURCE_URLS: 'linkedinTrendSourceUrls',
    MAX_TOKENS: 'generationMaxTokens',
    TYPED_DECISION_TIMEOUT_MS: 'typedDecisionTimeoutMs',
    REPLICATE_MODEL_HARDWARE: 'replicateModelHardware',
    REPLICATE_MODEL_VISIBILITY: 'replicateModelVisibility',
    REPLICATE_MODELS_TRAINER: 'replicateTrainerModel',
    REPLICATE_TARGET_FPS: 'replicateTargetFps',
    REPLICATE_TARGET_RESOLUTION: 'replicateTargetResolution',
    KLINGAI_MODEL: 'klingModel',
    ELEVENLABS_MODEL: 'elevenlabsModel',
    MUREKA_MODEL: 'murekaModel',
    TRAINING_TRAINING_CREDITS_COST: 'trainingCreditsCost',
    TRAINING_CUSTOM_MODEL_CREDITS_COST: 'customModelCreditsCost',
    AGENT_CONTEXT_WINDOW_SIZE: 'agentContextWindowSize',
    AGENT_CONTEXT_COMPRESSION_MODEL: 'agentContextCompressionModel',
  };
  return {
    getFeatureSettings: async () => {
      const settings = { ...DEFAULT_PLATFORM_FEATURE_SETTINGS };
      for (const [key, field] of Object.entries(mappings)) {
        const value = config?.get(key);
        if (value !== undefined && value !== null && value !== '')
          Object.assign(settings, { [field]: value });
      }
      return settings;
    },
  } as unknown as PlatformSettingsService;
}
