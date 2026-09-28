import { ModerationCategory } from '../enums/moderation-category.enum';
import type { TypedDecisionMode } from '../interfaces/ai/typed-decision.interface';
import type { ModerationProviderName } from '../interfaces/ingredients/media-moderation.interface';
import type {
  IPlatformFeatureSettings,
  ShadowCappedDecisionMode,
} from '../interfaces/settings/platform-setting.interface';

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
  confidence: { max: 1, min: 0 },
  mediaPerceptionFrameCount: { max: 24, min: 1 },
  mediaPerceptionLookbackHours: { max: 720, min: 1 },
} as const;

/**
 * What a deployment gets before an operator touches anything (#5407). Each
 * value equals the default of the env variable it replaced.
 */
export const DEFAULT_PLATFORM_FEATURE_SETTINGS: Readonly<IPlatformFeatureSettings> =
  {
    agentAutoRoutingDecisionMode: 'off',
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
    agentAutoRoutingDecisionMode: pickOption(
      row.agentAutoRoutingDecisionMode,
      TYPED_DECISION_MODES,
      defaults.agentAutoRoutingDecisionMode,
    ),
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
