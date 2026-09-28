import type { PlatformFlagKey } from '../../constants/feature-flags.constant';
import type { ModerationCategory } from '../../enums/moderation-category.enum';
import type { MarginInputMode } from '../../enums/platform-setting.enum';
import type {
  TypedDecisionMode,
  TypedDecisionProviderName,
} from '../ai/typed-decision.interface';
import type { IBaseEntity } from '../core/base.interface';
import type { ModerationProviderName } from '../ingredients/media-moderation.interface';

/**
 * Rollout mode of a decision point whose `live` activation is closed
 * (release-blocker follow-up, epic #4863): the provider answer is recorded but
 * never acted on.
 */
export type ShadowCappedDecisionMode = Exclude<TypedDecisionMode, 'live'>;

/** On/off state of every module and feature flag (#5468); `true` is on. */
export type IPlatformFlags = Readonly<Record<PlatformFlagKey, boolean>>;

/**
 * Product feature switches (#5407).
 *
 * Operator decisions about product behaviour, kept on the platform-settings
 * singleton rather than in env so changing one takes an admin click instead
 * of a deploy. Every default equals the retired env variable's default; see
 * `DEFAULT_PLATFORM_FEATURE_SETTINGS`. Secrets, keys, URLs and true
 * infrastructure (`BETTER_AUTH_ENABLED`, `SENTRY_ENABLED`) stay in env.
 */
export interface IPlatformFeatureSettings {
  /** Media perception sweep (#4879). `false` stops the workers enqueuing assets. */
  isMediaPerceptionEnabled: boolean;
  /** Evenly spaced stills sampled per video, 1..24. */
  mediaPerceptionFrameCount: number;
  /** How far back the sweep looks for unperceived assets, 1..720 hours. */
  mediaPerceptionLookbackHours: number;
  /** Scene-description vision model; `null` uses `LLM_DEFAULTS.fastText`. */
  mediaPerceptionVisionModel: string | null;
  /** Vision-evaluation flags (#4881). */
  mediaGateVisionMode: TypedDecisionMode;
  /** Text decisions on perception output (#4882). */
  mediaTextGateDecisionMode: TypedDecisionMode;
  mediaTextGateMinConfidence: number;
  /** Moderation gate (#4880). */
  moderationMode: TypedDecisionMode;
  moderationProvider: ModerationProviderName;
  /** Per-category overrides of `DEFAULT_MODERATION_THRESHOLDS`; lower is stricter. */
  moderationThresholds: Partial<Record<ModerationCategory, number>>;
  /** Agent auto-routing (#4865). No confidence: the candidate is a registry read. */
  agentAutoRoutingDecisionMode: TypedDecisionMode;
  /** Model-discovery category decision (#4869). */
  modelDiscoveryDecisionMode: TypedDecisionMode;
  modelDiscoveryMinConfidence: number;
  /** Pattern-analyzer labels (#4868). */
  patternAnalyzerDecisionMode: ShadowCappedDecisionMode;
  patternAnalyzerMinConfidence: number;
  /** Reply-bot intent (#4866). */
  replyBotIntentDecisionMode: TypedDecisionMode;
  replyBotIntentMinConfidence: number;
  /** Task-routing output type (#4867). */
  taskRoutingDecisionMode: ShadowCappedDecisionMode;
  taskRoutingMinConfidence: number;
  /** Untrusted-content gate (#4870, live closed pending #4944). */
  untrustedContentDecisionMode: ShadowCappedDecisionMode;
  untrustedContentMinConfidence: number;
  /** Summarise older agent-thread turns to fit the context window. */
  isAgentContextCompressionEnabled: boolean;
  /** Real token-by-token agent streaming instead of simulated word splits. */
  isAgentTokenStreamingEnabled: boolean;
  /**
   * ISO timestamp from which signup and billing system events are recorded;
   * `null` disables recording. Events that occurred earlier are never
   * recorded, so enabling never replays historical signups.
   */
  systemEventsEnabledAt: string | null;
  /** Better Auth: email/password accounts must verify their email to sign in. */
  isEmailVerificationRequired: boolean;
  /** Module and feature flags (#5468), edited from Admin → Flags. */
  flags: IPlatformFlags;
}

/**
 * Feature switches plus whether they came from the database (#5468).
 *
 * `isResolved` is false only when this process has never read the row (the
 * first read failed). The settings are then a conservative profile, and a
 * caller that must not guess — a publish gate, the system-event outbox —
 * holds or blocks instead of acting on them.
 */
export interface IPlatformFeatureSettingsState {
  isResolved: boolean;
  settings: IPlatformFeatureSettings;
}

/**
 * Platform-wide operator settings (singleton).
 *
 * Cross-client business/infra knobs configured from the top-level `/admin`
 * operator area — distinct from per-user `Setting` and per-org
 * `OrganizationSetting`. Access is restricted to platform superadmins.
 */
export interface IPlatformSetting
  extends IBaseEntity,
    IPlatformFeatureSettings {
  /**
   * Sell/cost ratio applied to provider USD for **generation** billing. 1.0 =
   * provider cost, 3.33 = 70% margin on sell price. See `applyMargin` in
   * `@genfeedai/pricing`. Independent of `marginMultiplierAgentChat` — see
   * issue #5172.
   */
  marginMultiplierGeneration: number;

  /**
   * Sell/cost ratio applied to provider USD for **agent chat** billing. 1.0 =
   * provider cost, 1.7 = 70% markup on provider cost. See
   * `calculateAgentExactCredits` in `@genfeedai/contracts/constants`.
   * Independent of `marginMultiplierGeneration` — see issue #5172.
   */
  marginMultiplierAgentChat: number;

  /**
   * How an operator types and reads both margin multipliers above in
   * `/admin`: a markup percent on provider cost, or a margin percent on sell
   * price. Never changes what is stored or billed — billing always applies
   * `cost × multiplier`. See `multiplierToPercent` / `percentToMultiplier` in
   * `@genfeedai/pricing`.
   */
  marginInputMode: MarginInputMode;

  /**
   * Which provider answers typed decisions (epic #4863). `none` keeps every
   * migrated decision point on its deterministic path.
   *
   * This is enablement, not availability: the `TYPESAFE_API_KEY` credential
   * decides whether a hosted provider is *possible*, an operator decides
   * whether it is *on*. Kept here rather than in the environment so turning a
   * misbehaving vendor off takes a click rather than a deploy.
   */
  typedDecisionProvider: TypedDecisionProviderName;
}

/** Fields a platform operator may update via `/admin`. */
export interface IUpdatePlatformSettingPayload
  extends Partial<Omit<IPlatformFeatureSettings, 'flags'>> {
  /** Flags to change; omitted flags keep their stored value (#5468). */
  flags?: Partial<Record<PlatformFlagKey, boolean>>;
  marginMultiplierGeneration?: number;
  marginMultiplierAgentChat?: number;
  marginInputMode?: MarginInputMode;
  typedDecisionProvider?: TypedDecisionProviderName;
}
