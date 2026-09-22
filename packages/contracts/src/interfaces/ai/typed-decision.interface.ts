/**
 * Typed decisions (#4864, epic #4863).
 *
 * One contract for the small, bounded, text-only decisions the product makes
 * dozens of times per request: pick an option, rate a state, answer yes/no.
 * Every answer carries a calibrated confidence so callers can gate on it.
 *
 * Nothing in this file may describe a vendor wire format. Provider adapters
 * own their request/response shapes; everything else depends on these types
 * only, so swapping the vendor never reaches a call site.
 */

/** Vendor usage for one decision, when the provider reports it. */
export interface TypedDecisionUsage {
  /** Vendor model identifier, recorded next to LLM spend in the ledger. */
  model: string;
  inputTokens: number;
  outputTokens: number;
  /**
   * `observed` when the vendor stated the charge, `calculated` when the
   * provider derived it from token counts and a published list price. Absent
   * with `vendorCostMicros` when nothing is known.
   */
  costEvidence?: 'observed' | 'calculated';
  /** Vendor charge in micro-USD, when known; see `costEvidence`. */
  vendorCostMicros?: number;
}

export interface TypedDecisionAnswer<TValue> {
  /** Calibrated 0..1. Callers compare it against a per-decision threshold. */
  confidence: number;
  usage?: TypedDecisionUsage;
  value: TValue;
}

export interface TypedDecisionChoiceParams<TOption extends string> {
  /**
   * Optional one-line description per option. Providers that take a rubric
   * send it alongside the label; a described option is judged more reliably
   * than a bare enum member.
   */
  descriptions?: Readonly<Partial<Record<TOption, string>>>;
  /**
   * Genfeed enum members, never model names, registry keys or free text.
   * Bounded by TYPED_DECISION_MAX_OPTIONS.
   */
  options: readonly TOption[];
  question: string;
  /**
   * The state to judge. Sent as data, never as instructions — tool results and
   * user text stay framed as untrusted content.
   */
  state: Record<string, unknown>;
}

export interface TypedDecisionScoreParams {
  question: string;
  /**
   * Optional ordinal rubric, lowest level first, at least two levels and at
   * most TYPED_DECISION_MAX_OPTIONS. The answer is still normalised to 0..1
   * with the top level at 1; without a scale the provider uses its own.
   */
  scale?: readonly string[];
  state: Record<string, unknown>;
}

export interface TypedDecisionBooleanParams {
  question: string;
  state: Record<string, unknown>;
}

/** Per-call provider options. The service always passes an abort signal. */
export interface TypedDecisionProviderCallOptions {
  signal?: AbortSignal;
}

export interface TypedDecisionProvider {
  /** Stable provider name recorded in telemetry (`none`, `jev`). */
  readonly name: string;
  choose<TOption extends string>(
    params: TypedDecisionChoiceParams<TOption>,
    options?: TypedDecisionProviderCallOptions,
  ): Promise<TypedDecisionAnswer<TOption> | null>;
  /** Score answers are normalised to 0..1; the provider owns its own range. */
  score(
    params: TypedDecisionScoreParams,
    options?: TypedDecisionProviderCallOptions,
  ): Promise<TypedDecisionAnswer<number> | null>;
  decide(
    params: TypedDecisionBooleanParams,
    options?: TypedDecisionProviderCallOptions,
  ): Promise<TypedDecisionAnswer<boolean> | null>;
}

/**
 * Rollout mode of one decision point: `off` keeps today's deterministic path,
 * `shadow` calls the provider and records the disagreement, `live` acts on the
 * provider answer above its threshold.
 */
export type TypedDecisionMode = 'off' | 'shadow' | 'live';

/**
 * The rollout gate of one decision point, resolved from config: how far the
 * call site has flipped, and the confidence a provider answer must clear
 * before it is acted on. #4912 moves these reads behind a settings service.
 */
export interface TypedDecisionRolloutSettings {
  /** 0..1. Anything below it is treated exactly like a `null` answer. */
  minConfidence: number;
  mode: TypedDecisionMode;
}

/** The answer a migrated call site would have produced without a provider. */
export type TypedDecisionDeterministicAnswer = boolean | number | string;

/**
 * Call-site context. `decisionPoint` is the telemetry key sibling issues query
 * shadow-mode agreement by, so it must be stable per migrated call site.
 */
export interface TypedDecisionCallContext {
  brandId?: string;
  decisionPoint: string;
  deterministicAnswer?: TypedDecisionDeterministicAnswer;
  mode?: TypedDecisionMode;
  organizationId?: string;
  runId?: string;
  threadId?: string;
  /** Overrides TYPED_DECISION_TIMEOUT_MS for slower async paths. */
  timeoutMs?: number;
  userId?: string;
}

export type TypedDecisionKind = 'boolean' | 'choice' | 'score';

/** Why a call resolved `null`. Absent when the provider answered. */
export type TypedDecisionFailureReason =
  | 'error'
  | 'malformed'
  | 'rate_limited'
  | 'timeout'
  | 'unavailable';

/**
 * One recorded decision. Never carries the state, the question or any prompt
 * text — the same posture as the LLM completion telemetry event.
 */
export interface TypedDecisionTelemetryRecord {
  answer?: TypedDecisionDeterministicAnswer;
  brandId?: string;
  confidence?: number;
  decisionPoint: string;
  deterministicAnswer?: TypedDecisionDeterministicAnswer;
  failureReason?: TypedDecisionFailureReason;
  kind: TypedDecisionKind;
  latencyMs: number;
  mode: TypedDecisionMode;
  organizationId?: string;
  provider: string;
  /** Cooldown surfaced by a 429, in seconds. */
  retryAfterSeconds?: number;
  runId?: string;
  threadId?: string;
  usage?: TypedDecisionUsage;
  userId?: string;
}

/**
 * Allowlisted analytics properties for one recorded decision. Mirrors
 * ILlmGenerationTelemetryProperties: identifiers, numbers and enum labels
 * only, never the state or the question.
 */
export interface TypedDecisionTelemetryProperties {
  answer?: TypedDecisionDeterministicAnswer;
  brand_id?: string;
  confidence?: number;
  decision_point: string;
  deterministic_answer?: TypedDecisionDeterministicAnswer;
  failure_reason?: TypedDecisionFailureReason;
  input_tokens?: number;
  /** Provider and deterministic answers matched. Shadow mode's whole point. */
  is_agreement?: boolean;
  kind: TypedDecisionKind;
  latency_ms: number;
  mode: TypedDecisionMode;
  organization_id?: string;
  output_tokens?: number;
  provider: string;
  retry_after_seconds?: number;
  run_id?: string;
  thread_id?: string;
  vendor_cost_micros?: number;
  vendor_model?: string;
}
