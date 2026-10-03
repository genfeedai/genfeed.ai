import { ModerationCategory } from '../enums/moderation-category.enum';
import type { TypedDecisionMode } from '../interfaces/ai/typed-decision.interface';
import type { ModerationProviderName } from '../interfaces/ingredients/media-moderation.interface';
import type {
  IPlatformFeatureSettings,
  ShadowCappedDecisionMode,
} from '../interfaces/settings/platform-setting.interface';
import {
  DEFAULT_PLATFORM_FLAGS,
  parsePlatformFlags,
  resolvePlatformFlags,
} from './feature-flags.constant';

/** Every rollout mode a decision point can take. */
export const TYPED_DECISION_MODES: readonly TypedDecisionMode[] = [
  'off',
  'shadow',
  'live',
];

/** Modes of a decision point whose `live` activation is closed. */
export const SHADOW_CAPPED_DECISION_MODES: readonly ShadowCappedDecisionMode[] =
  ['off', 'shadow'];

/** Every selectable moderation classifier. */
export const MODERATION_PROVIDER_NAMES: readonly ModerationProviderName[] = [
  'none',
  'openai',
];

/** Inclusive bounds of the numeric feature switches. */
export const PLATFORM_FEATURE_SETTING_BOUNDS = {
  imageCompressionQuality: { min: 1, max: 100 },
  paygFallbackCredits: { min: 1, max: 1000000 },
  agentContextWindowSize: { min: 1, max: 200 },
  generationMaxTokens: { min: 1, max: 128000 },
  typedDecisionTimeoutMs: { min: 1, max: 60000 },
  trainingCreditsCost: { min: 0, max: 1000000 },
  customModelCreditsCost: { min: 0, max: 1000000 },
  replicateTargetFps: { min: 1, max: 120 },
  confidence: { max: 1, min: 0 },
  mediaPerceptionFrameCount: { max: 24, min: 1 },
  mediaPerceptionLookbackHours: { max: 720, min: 1 },
} as const;

/**
 * Most workflows an operator may pin to the templates Featured row (#5511).
 * The row is a short carousel, not a second catalog.
 */
export const FEATURED_WORKFLOW_LIMIT = 12;

/**
 * What a deployment gets before an operator touches anything (#5407). Each
 * value equals the default of the env variable it replaced.
 */
export const DEFAULT_PLATFORM_FEATURE_SETTINGS: Readonly<IPlatformFeatureSettings> =
  {
    imageCompressionQuality: 50,
    paygFallbackCredits: 1000,
    linkedinTrendSourceUrls: null,
    agentContextCompressionModel: null,
    agentContextWindowSize: 5,
    generationMaxTokens: 4000,
    typedDecisionTimeoutMs: 800,
    trainingCreditsCost: 500,
    customModelCreditsCost: 5,
    replicateModelHardware: 'gpu-t4',
    replicateModelVisibility: 'private',
    replicateTrainerModel:
      'replicate/fast-flux-trainer:f463fbfc97389e10a2f443a8a84b6953b1058eafbf0c9af4d84457ff07cb04db',
    replicateTargetFps: 30,
    replicateTargetResolution: '1080p',
    klingModel: 'kling-v2',
    elevenlabsModel: null,
    murekaModel: 'mureka-9',
    discordChannelIdDeployments: null,
    discordChannelIdPosts: null,
    discordChannelIdStudio: null,
    discordChannelIdUsers: null,
    discordChannelIdModels: null,
    discordBotAvatarUrl: null,
    discordWebhookNamePrefix: null,
    discordWebhookReason: null,
    emailFromAddress: null,
    emailReplyToAddress: null,
    agentAutoRoutingDecisionMode: 'off',
    // Nothing pinned: the templates page hides Featured (#5511).
    featuredWorkflowIds: [],
    flags: DEFAULT_PLATFORM_FLAGS,
    isAgentContextCompressionEnabled: true,
    isAgentTokenStreamingEnabled: false,
    isEmailVerificationRequired: false,
    isMediaPerceptionEnabled: true,
    mediaGateVisionMode: 'off',
    mediaPerceptionFrameCount: 6,
    mediaPerceptionLookbackHours: 24,
    mediaPerceptionVisionModel: null,
    mediaTextGateDecisionMode: 'off',
    mediaTextGateMinConfidence: 0.85,
    modelDiscoveryDecisionMode: 'off',
    modelDiscoveryMinConfidence: 0.85,
    moderationMode: 'shadow',
    moderationProvider: 'none',
    moderationThresholds: {},
    patternAnalyzerDecisionMode: 'shadow',
    patternAnalyzerMinConfidence: 0.85,
    replyBotIntentDecisionMode: 'off',
    replyBotIntentMinConfidence: 0.85,
    systemEventsEnabledAt: null,
    taskRoutingDecisionMode: 'shadow',
    taskRoutingMinConfidence: 0.85,
    untrustedContentDecisionMode: 'off',
    untrustedContentMinConfidence: 0.95,
  };

/**
 * What a process serves before it has ever read the settings row (#5468):
 * the defaults tightened to the production values — email verification on,
 * the perception sweep off. Never cached; the next call retries the read.
 */
export const UNRESOLVED_PLATFORM_FEATURE_SETTINGS: Readonly<IPlatformFeatureSettings> =
  {
    ...DEFAULT_PLATFORM_FEATURE_SETTINGS,
    isEmailVerificationRequired: true,
    isMediaPerceptionEnabled: false,
  };

const MODERATION_CATEGORIES = new Set<string>(
  Object.values(ModerationCategory),
);

function isModerationCategory(value: string): value is ModerationCategory {
  return MODERATION_CATEGORIES.has(value);
}

function pickOption<TOption extends string>(
  value: unknown,
  options: readonly TOption[],
  fallback: TOption,
): TOption {
  return options.find((option) => option === value) ?? fallback;
}

function pickBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function pickNumber(
  value: unknown,
  bounds: { readonly max: number; readonly min: number },
  fallback: number,
  isInteger = false,
): number {
  return typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= bounds.min &&
    value <= bounds.max &&
    (!isInteger || Number.isInteger(value))
    ? value
    : fallback;
}

function pickConfidence(value: unknown, fallback: number): number {
  return pickNumber(
    value,
    PLATFORM_FEATURE_SETTING_BOUNDS.confidence,
    fallback,
  );
}

export const EMAIL_ADDRESS_PATTERN =
  /^(?:[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+|[^<>\r\n]+<[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+>)$/;

function pickRuntimeString<T extends string | null>(
  value: unknown,
  fallback: T,
  pattern?: RegExp,
): string | T {
  const text = typeof value === 'string' ? value.trim() : '';
  return text &&
    text.length <= 320 &&
    !/[\r\n]/.test(text) &&
    (!pattern || pattern.test(text))
    ? text
    : fallback;
}

function pickTimestamp(value: unknown): string | null {
  const date =
    value instanceof Date
      ? value
      : typeof value === 'string' && value.trim()
        ? new Date(value)
        : null;
  return date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

/**
 * Keep only known categories with a confidence in 0..1. Anything else in a
 * hand-edited row is dropped rather than trusted.
 */
export function parseModerationThresholdOverrides(
  value: unknown,
): Partial<Record<ModerationCategory, number>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const overrides: Partial<Record<ModerationCategory, number>> = {};
  for (const [key, threshold] of Object.entries(value)) {
    if (
      isModerationCategory(key) &&
      typeof threshold === 'number' &&
      Number.isFinite(threshold) &&
      threshold >= 0 &&
      threshold <= 1
    ) {
      overrides[key] = threshold;
    }
  }
  return overrides;
}

/**
 * Pinned Featured workflow ids (#5511) in pin order: trimmed, non-empty,
 * unique strings, at most {@link FEATURED_WORKFLOW_LIMIT}. Anything else in a
 * hand-edited row is dropped rather than trusted, so a malformed column reads
 * as fewer pins, never as an error.
 */
export function parseFeaturedWorkflowIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const ids: string[] = [];
  for (const entry of value) {
    const id = typeof entry === 'string' ? entry.trim() : '';
    if (id && !ids.includes(id)) {
      ids.push(id);
    }
    if (ids.length === FEATURED_WORKFLOW_LIMIT) {
      break;
    }
  }
  return ids;
}

/**
 * Narrow a persisted platform-settings row to typed feature switches.
 *
 * Fails closed field by field: a value written by a newer deployment, or
 * corrupted by hand, resolves to that field's default — and a shadow-capped
 * decision point can never resolve to `live`.
 */
export function parsePlatformFeatureSettings(
  row: Readonly<Partial<Record<keyof IPlatformFeatureSettings, unknown>>>,
): IPlatformFeatureSettings {
  const defaults = DEFAULT_PLATFORM_FEATURE_SETTINGS;
  const bounds = PLATFORM_FEATURE_SETTING_BOUNDS;
  const visionModel =
    typeof row.mediaPerceptionVisionModel === 'string'
      ? row.mediaPerceptionVisionModel.trim()
      : '';

  return {
    imageCompressionQuality: pickNumber(
      row.imageCompressionQuality,
      bounds.imageCompressionQuality,
      defaults.imageCompressionQuality,
      true,
    ),
    paygFallbackCredits: pickNumber(
      row.paygFallbackCredits,
      bounds.paygFallbackCredits,
      defaults.paygFallbackCredits,
      true,
    ),
    linkedinTrendSourceUrls: pickRuntimeString(
      row.linkedinTrendSourceUrls,
      defaults.linkedinTrendSourceUrls,
    ),
    agentContextCompressionModel: pickRuntimeString(
      row.agentContextCompressionModel,
      defaults.agentContextCompressionModel,
      undefined,
    ),
    agentContextWindowSize: pickNumber(
      row.agentContextWindowSize,
      bounds.agentContextWindowSize,
      defaults.agentContextWindowSize,
      true,
    ),
    generationMaxTokens: pickNumber(
      row.generationMaxTokens,
      bounds.generationMaxTokens,
      defaults.generationMaxTokens,
      true,
    ),
    typedDecisionTimeoutMs: pickNumber(
      row.typedDecisionTimeoutMs,
      bounds.typedDecisionTimeoutMs,
      defaults.typedDecisionTimeoutMs,
      true,
    ),
    trainingCreditsCost: pickNumber(
      row.trainingCreditsCost,
      bounds.trainingCreditsCost,
      defaults.trainingCreditsCost,
      false,
    ),
    customModelCreditsCost: pickNumber(
      row.customModelCreditsCost,
      bounds.customModelCreditsCost,
      defaults.customModelCreditsCost,
      false,
    ),
    replicateModelHardware: pickRuntimeString(
      row.replicateModelHardware,
      defaults.replicateModelHardware,
      undefined,
    ),
    replicateModelVisibility: pickOption(
      row.replicateModelVisibility,
      ['private', 'public'],
      defaults.replicateModelVisibility,
    ),
    replicateTrainerModel: pickRuntimeString(
      row.replicateTrainerModel,
      defaults.replicateTrainerModel,
      undefined,
    ),
    replicateTargetFps: pickNumber(
      row.replicateTargetFps,
      bounds.replicateTargetFps,
      defaults.replicateTargetFps,
      true,
    ),
    replicateTargetResolution: pickRuntimeString(
      row.replicateTargetResolution,
      defaults.replicateTargetResolution,
      undefined,
    ),
    klingModel: pickRuntimeString(
      row.klingModel,
      defaults.klingModel,
      undefined,
    ),
    elevenlabsModel: pickRuntimeString(
      row.elevenlabsModel,
      defaults.elevenlabsModel,
      undefined,
    ),
    murekaModel: pickRuntimeString(
      row.murekaModel,
      defaults.murekaModel,
      undefined,
    ),
    discordChannelIdDeployments: pickRuntimeString(
      row.discordChannelIdDeployments,
      defaults.discordChannelIdDeployments,
      /^\d{17,20}$/,
    ),
    discordChannelIdPosts: pickRuntimeString(
      row.discordChannelIdPosts,
      defaults.discordChannelIdPosts,
      /^\d{17,20}$/,
    ),
    discordChannelIdStudio: pickRuntimeString(
      row.discordChannelIdStudio,
      defaults.discordChannelIdStudio,
      /^\d{17,20}$/,
    ),
    discordChannelIdUsers: pickRuntimeString(
      row.discordChannelIdUsers,
      defaults.discordChannelIdUsers,
      /^\d{17,20}$/,
    ),
    discordChannelIdModels: pickRuntimeString(
      row.discordChannelIdModels,
      defaults.discordChannelIdModels,
      /^\d{17,20}$/,
    ),
    discordBotAvatarUrl: pickRuntimeString(
      row.discordBotAvatarUrl,
      defaults.discordBotAvatarUrl,
      /^https:\/\/[^\s]+$/,
    ),
    discordWebhookNamePrefix: pickRuntimeString(
      row.discordWebhookNamePrefix,
      defaults.discordWebhookNamePrefix,
      undefined,
    ),
    discordWebhookReason: pickRuntimeString(
      row.discordWebhookReason,
      defaults.discordWebhookReason,
      undefined,
    ),
    emailFromAddress: pickRuntimeString(
      row.emailFromAddress,
      defaults.emailFromAddress,
      EMAIL_ADDRESS_PATTERN,
    ),
    emailReplyToAddress: pickRuntimeString(
      row.emailReplyToAddress,
      defaults.emailReplyToAddress,
      /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/,
    ),
    agentAutoRoutingDecisionMode: pickOption(
      row.agentAutoRoutingDecisionMode,
      TYPED_DECISION_MODES,
      defaults.agentAutoRoutingDecisionMode,
    ),
    featuredWorkflowIds: parseFeaturedWorkflowIds(row.featuredWorkflowIds),
    flags: resolvePlatformFlags(parsePlatformFlags(row.flags)),
    isAgentContextCompressionEnabled: pickBoolean(
      row.isAgentContextCompressionEnabled,
      defaults.isAgentContextCompressionEnabled,
    ),
    isAgentTokenStreamingEnabled: pickBoolean(
      row.isAgentTokenStreamingEnabled,
      defaults.isAgentTokenStreamingEnabled,
    ),
    isEmailVerificationRequired: pickBoolean(
      row.isEmailVerificationRequired,
      defaults.isEmailVerificationRequired,
    ),
    isMediaPerceptionEnabled: pickBoolean(
      row.isMediaPerceptionEnabled,
      defaults.isMediaPerceptionEnabled,
    ),
    mediaGateVisionMode: pickOption(
      row.mediaGateVisionMode,
      TYPED_DECISION_MODES,
      defaults.mediaGateVisionMode,
    ),
    mediaPerceptionFrameCount: pickNumber(
      row.mediaPerceptionFrameCount,
      bounds.mediaPerceptionFrameCount,
      defaults.mediaPerceptionFrameCount,
      true,
    ),
    mediaPerceptionLookbackHours: pickNumber(
      row.mediaPerceptionLookbackHours,
      bounds.mediaPerceptionLookbackHours,
      defaults.mediaPerceptionLookbackHours,
      true,
    ),
    mediaPerceptionVisionModel: visionModel || null,
    mediaTextGateDecisionMode: pickOption(
      row.mediaTextGateDecisionMode,
      TYPED_DECISION_MODES,
      defaults.mediaTextGateDecisionMode,
    ),
    mediaTextGateMinConfidence: pickConfidence(
      row.mediaTextGateMinConfidence,
      defaults.mediaTextGateMinConfidence,
    ),
    modelDiscoveryDecisionMode: pickOption(
      row.modelDiscoveryDecisionMode,
      TYPED_DECISION_MODES,
      defaults.modelDiscoveryDecisionMode,
    ),
    modelDiscoveryMinConfidence: pickConfidence(
      row.modelDiscoveryMinConfidence,
      defaults.modelDiscoveryMinConfidence,
    ),
    moderationMode: pickOption(
      row.moderationMode,
      TYPED_DECISION_MODES,
      defaults.moderationMode,
    ),
    // Anything but an explicit, known provider keeps media on the host.
    moderationProvider: pickOption(
      row.moderationProvider,
      MODERATION_PROVIDER_NAMES,
      defaults.moderationProvider,
    ),
    moderationThresholds: parseModerationThresholdOverrides(
      row.moderationThresholds,
    ),
    patternAnalyzerDecisionMode: pickOption(
      row.patternAnalyzerDecisionMode,
      SHADOW_CAPPED_DECISION_MODES,
      defaults.patternAnalyzerDecisionMode,
    ),
    patternAnalyzerMinConfidence: pickConfidence(
      row.patternAnalyzerMinConfidence,
      defaults.patternAnalyzerMinConfidence,
    ),
    replyBotIntentDecisionMode: pickOption(
      row.replyBotIntentDecisionMode,
      TYPED_DECISION_MODES,
      defaults.replyBotIntentDecisionMode,
    ),
    replyBotIntentMinConfidence: pickConfidence(
      row.replyBotIntentMinConfidence,
      defaults.replyBotIntentMinConfidence,
    ),
    systemEventsEnabledAt: pickTimestamp(row.systemEventsEnabledAt),
    taskRoutingDecisionMode: pickOption(
      row.taskRoutingDecisionMode,
      SHADOW_CAPPED_DECISION_MODES,
      defaults.taskRoutingDecisionMode,
    ),
    taskRoutingMinConfidence: pickConfidence(
      row.taskRoutingMinConfidence,
      defaults.taskRoutingMinConfidence,
    ),
    untrustedContentDecisionMode: pickOption(
      row.untrustedContentDecisionMode,
      SHADOW_CAPPED_DECISION_MODES,
      defaults.untrustedContentDecisionMode,
    ),
    untrustedContentMinConfidence: pickConfidence(
      row.untrustedContentMinConfidence,
      defaults.untrustedContentMinConfidence,
    ),
  };
}
