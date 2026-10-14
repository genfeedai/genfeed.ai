import {
  DEFAULT_PLATFORM_FEATURE_SETTINGS,
  parsePlatformFeatureSettings,
} from '../../packages/contracts/src/constants/platform-feature-settings.constant';
import type { IPlatformFeatureSettings } from '../../packages/contracts/src/interfaces/settings/platform-setting.interface';

export const PLATFORM_RUNTIME_ENV_MIGRATIONS = {
  AGENT_CONTEXT_COMPRESSION_MODEL: 'agentContextCompressionModel',
  AGENT_CONTEXT_WINDOW_SIZE: 'agentContextWindowSize',
  MAX_TOKENS: 'generationMaxTokens',
  TYPED_DECISION_TIMEOUT_MS: 'typedDecisionTimeoutMs',
  TRAINING_TRAINING_CREDITS_COST: 'trainingCreditsCost',
  TRAINING_CUSTOM_MODEL_CREDITS_COST: 'customModelCreditsCost',
  REPLICATE_MODEL_HARDWARE: 'replicateModelHardware',
  REPLICATE_MODEL_VISIBILITY: 'replicateModelVisibility',
  REPLICATE_MODELS_TRAINER: 'replicateTrainerModel',
  REPLICATE_TARGET_FPS: 'replicateTargetFps',
  REPLICATE_TARGET_RESOLUTION: 'replicateTargetResolution',
  KLINGAI_MODEL: 'klingModel',
  ELEVENLABS_MODEL: 'elevenlabsModel',
  MUREKA_MODEL: 'murekaModel',
  DISCORD_CHANNEL_ID_DEPLOYMENTS: 'discordChannelIdDeployments',
  DISCORD_CHANNEL_ID_POSTS: 'discordChannelIdPosts',
  DISCORD_CHANNEL_ID_STUDIO: 'discordChannelIdStudio',
  DISCORD_CHANNEL_ID_USERS: 'discordChannelIdUsers',
  DISCORD_CHANNEL_ID_MODELS: 'discordChannelIdModels',
  DISCORD_BOT_AVATAR_URL: 'discordBotAvatarUrl',
  DISCORD_WEBHOOK_NAME_PREFIX: 'discordWebhookNamePrefix',
  DISCORD_WEBHOOK_REASON: 'discordWebhookReason',
  RESEND_FROM_EMAIL: 'emailFromAddress',
  RESEND_REPLY_TO_EMAIL: 'emailReplyToAddress',
  AWS_IMAGE_COMPRESSION: 'imageCompressionQuality',
  STRIPE_PAYG_CREDITS: 'paygFallbackCredits',
  LINKEDIN_TREND_SOURCE_URLS: 'linkedinTrendSourceUrls',
} as const satisfies Record<string, keyof IPlatformFeatureSettings>;

export function legacyRuntimeSettings(
  env: Record<string, string | undefined>,
): Partial<IPlatformFeatureSettings> {
  const result: Partial<IPlatformFeatureSettings> = {};
  for (const [key, field] of Object.entries(PLATFORM_RUNTIME_ENV_MIGRATIONS)) {
    const raw = env[key]?.trim();
    if (!raw) continue;
    const value =
      typeof DEFAULT_PLATFORM_FEATURE_SETTINGS[field] === 'number'
        ? Number(raw)
        : raw;
    const resolved = parsePlatformFeatureSettings({ [field]: value })[field];
    if (resolved !== value) throw new Error(`Invalid legacy setting: ${key}`);
    Object.assign(result, { [field]: resolved });
  }
  return result;
}
