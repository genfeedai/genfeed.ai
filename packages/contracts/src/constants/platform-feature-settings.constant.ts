import { ModerationCategory } from '../enums/moderation-category.enum';
import type { TypedDecisionMode } from '../interfaces/ai/typed-decision.interface';
import type { ModerationProviderName } from '../interfaces/ingredients/media-moderation.interface';
import type {
  IPlatformFeatureFlagResult,
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
 * What a deployment gets with no PostHog, and the value of any switch whose
 * flag does not exist (#5407). Each equals the default of the env variable it
 * replaced.
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

/**
 * What SaaS serves when PostHog is configured but has not answered yet
 * (#5468): production's posture rather than the self-host defaults, so an
 * outage at boot never turns email verification off or starts paid media
 * perception. Never cached — the next call asks PostHog again.
 */
export const SAAS_UNRESOLVED_PLATFORM_FEATURE_SETTINGS: Readonly<IPlatformFeatureSettings> =
  {
    ...DEFAULT_PLATFORM_FEATURE_SETTINGS,
    isEmailVerificationRequired: true,
    isMediaPerceptionEnabled: false,
  };

/**
 * PostHog feature flags that carry the product switches (#5468). Platform
 * switches are evaluated for one fixed identity,
 * {@link PLATFORM_FEATURE_FLAG_DISTINCT_ID}, so crons without a user resolve
 * them too; roll each flag out to 100% of that identity.
 *
 * Booleans map to on/off. Mode flags are multivariate (`shadow`, `live`;
 * disabled = `off`). Numeric settings ride in the flag's JSON payload.
 */
export const PLATFORM_FEATURE_FLAG_KEYS = {
  agentAutoRouting: 'agent_auto_routing',
  agentContextCompression: 'agent_context_compression',
  agentTokenStreaming: 'agent_token_streaming',
  mediaGateVision: 'media_gate_vision',
  mediaPerception: 'media_perception',
  mediaTextGate: 'media_text_gate',
  modelDiscoveryDecision: 'model_discovery_decision',
  moderation: 'moderation',
  patternAnalyzerDecision: 'pattern_analyzer_decision',
  replyBotIntentDecision: 'reply_bot_intent_decision',
  requireEmailVerification: 'require_email_verification',
  systemEventsRecording: 'system_events_recording',
  taskRoutingDecision: 'task_routing_decision',
  untrustedContentDecision: 'untrusted_content_decision',
} as const;

/** The PostHog person every platform switch is evaluated for. */
export const PLATFORM_FEATURE_FLAG_DISTINCT_ID = 'genfeed-platform';

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

type PlatformFeatureFlagResults = Readonly<
  Record<string, IPlatformFeatureFlagResult | undefined>
>;

function readPayload(result: IPlatformFeatureFlagResult | undefined): {
  readonly [key: string]: unknown;
} {
  const payload =
    typeof result?.payload === 'string'
      ? safeParseJson(result.payload)
      : result?.payload;
  return payload && typeof payload === 'object' && !Array.isArray(payload)
    ? (payload as { readonly [key: string]: unknown })
    : {};
}

function safeParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

/** A missing flag keeps the default; a disabled one is off. */
function readSwitch(
  result: IPlatformFeatureFlagResult | undefined,
): boolean | undefined {
  return result?.enabled;
}

/** A missing flag keeps the default; a disabled one is `off`. */
function readMode(
  result: IPlatformFeatureFlagResult | undefined,
): string | undefined {
  if (!result) {
    return undefined;
  }
  return result.enabled ? (result.variant ?? undefined) : 'off';
}

/**
 * Turn evaluated PostHog flags into typed switches (#5468). A flag that does
 * not exist keeps its default; everything else goes through
 * {@link parsePlatformFeatureSettings}, so an unknown variant or a malformed
 * payload fails closed field by field and shadow-capped points never go live.
 */
export function platformFeatureSettingsFromFlags(
  flags: PlatformFeatureFlagResults,
): IPlatformFeatureSettings {
  const keys = PLATFORM_FEATURE_FLAG_KEYS;
  const perception = flags[keys.mediaPerception];
  const perceptionPayload = readPayload(perception);
  const moderation = flags[keys.moderation];
  const moderationPayload = readPayload(moderation);
  const systemEvents = flags[keys.systemEventsRecording];

  return parsePlatformFeatureSettings({
    agentAutoRoutingDecisionMode: readMode(flags[keys.agentAutoRouting]),
    isAgentContextCompressionEnabled: readSwitch(
      flags[keys.agentContextCompression],
    ),
    isAgentTokenStreamingEnabled: readSwitch(flags[keys.agentTokenStreaming]),
    isEmailVerificationRequired: readSwitch(
      flags[keys.requireEmailVerification],
    ),
    isMediaPerceptionEnabled: readSwitch(perception),
    mediaGateVisionMode: readMode(flags[keys.mediaGateVision]),
    mediaPerceptionFrameCount: perceptionPayload.frameCount,
    mediaPerceptionLookbackHours: perceptionPayload.lookbackHours,
    mediaPerceptionVisionModel: perceptionPayload.visionModel,
    mediaTextGateDecisionMode: readMode(flags[keys.mediaTextGate]),
    mediaTextGateMinConfidence: readPayload(flags[keys.mediaTextGate])
      .minConfidence,
    modelDiscoveryDecisionMode: readMode(flags[keys.modelDiscoveryDecision]),
    modelDiscoveryMinConfidence: readPayload(flags[keys.modelDiscoveryDecision])
      .minConfidence,
    moderationMode: readMode(moderation),
    moderationProvider: moderationPayload.provider,
    moderationThresholds: moderationPayload.thresholds,
    patternAnalyzerDecisionMode: readMode(flags[keys.patternAnalyzerDecision]),
    patternAnalyzerMinConfidence: readPayload(
      flags[keys.patternAnalyzerDecision],
    ).minConfidence,
    replyBotIntentDecisionMode: readMode(flags[keys.replyBotIntentDecision]),
    replyBotIntentMinConfidence: readPayload(flags[keys.replyBotIntentDecision])
      .minConfidence,
    // Recording needs a start time: enabled without one stays off, so turning
    // the flag on can never replay historical signups.
    systemEventsEnabledAt: systemEvents?.enabled
      ? readPayload(systemEvents).since
      : null,
    taskRoutingDecisionMode: readMode(flags[keys.taskRoutingDecision]),
    taskRoutingMinConfidence: readPayload(flags[keys.taskRoutingDecision])
      .minConfidence,
    untrustedContentDecisionMode: readMode(
      flags[keys.untrustedContentDecision],
    ),
    untrustedContentMinConfidence: readPayload(
      flags[keys.untrustedContentDecision],
    ).minConfidence,
  });
}
