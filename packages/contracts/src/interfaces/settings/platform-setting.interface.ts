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

/**
 * Product feature switches (#5407, #5468).
 *
 * Operator decisions about product behaviour, served from PostHog feature
 * flags (see `PLATFORM_FEATURE_FLAG_KEYS`) so changing one takes a flag edit
 * instead of a deploy. Deployments without PostHog get
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
}

/**
 * Platform-wide operator settings (singleton).
 *
 * Cross-client business/infra knobs configured from the top-level `/admin`
 * operator area — distinct from per-user `Setting` and per-org
 * `OrganizationSetting`. Access is restricted to platform superadmins.
 */
export interface IPlatformSetting extends IBaseEntity {
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
export interface IUpdatePlatformSettingPayload {
  marginMultiplierGeneration?: number;
  marginMultiplierAgentChat?: number;
  marginInputMode?: MarginInputMode;
  typedDecisionProvider?: TypedDecisionProviderName;
}

/**
 * One evaluated PostHog flag, as the `/flags?v=2` endpoint reports it:
 * whether it matched, the multivariate variant it chose, and its JSON payload.
 */
export interface IPlatformFeatureFlagResult {
  enabled: boolean;
  payload?: unknown;
  variant?: string | null;
}
