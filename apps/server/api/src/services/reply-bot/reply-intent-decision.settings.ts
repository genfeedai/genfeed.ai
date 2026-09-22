/**
 * Rollout gate for the `reply_bot.intent` decision point (#4866).
 *
 * One function, one file — #4912 replaces every resolver of this shape with a
 * settings service, so nothing else belongs here.
 */

import type {
  IReplyIntentDecisionSettings,
  TypedDecisionMode,
} from '@genfeedai/contracts/interfaces';
import type { ConfigService } from '@libs/config/config.service';

/**
 * Stable telemetry key. #4874 queries shadow-mode agreement by it, so it must
 * not change once a single row has been recorded.
 */
export const REPLY_INTENT_DECISION_POINT = 'reply_bot.intent';

/** Matches REPLY_BOT_INTENT_MIN_CONFIDENCE's Joi default. */
export const REPLY_INTENT_DEFAULT_MIN_CONFIDENCE = 0.85;

/**
 * Reply-bot classification is an async path, so it takes the epic's 2s budget
 * rather than the 800ms the agent turn path runs on.
 */
export const REPLY_INTENT_DECISION_TIMEOUT_MS = 2_000;

function isTypedDecisionMode(value: unknown): value is TypedDecisionMode {
  return value === 'off' || value === 'shadow' || value === 'live';
}

export function resolveReplyIntentDecisionSettings(
  configService: ConfigService,
): IReplyIntentDecisionSettings {
  const rawMode = configService.get('REPLY_BOT_INTENT_DECISION_MODE');
  const mode: TypedDecisionMode = isTypedDecisionMode(rawMode)
    ? rawMode
    : 'off';

  // `Number('')` is 0, and a 0 threshold would wave every answer through, so
  // an unset value has to be rejected before it is parsed.
  const rawConfidence = String(
    configService.get('REPLY_BOT_INTENT_MIN_CONFIDENCE') ?? '',
  ).trim();
  const parsedConfidence =
    rawConfidence === '' ? Number.NaN : Number(rawConfidence);
  const minConfidence =
    Number.isFinite(parsedConfidence) &&
    parsedConfidence >= 0 &&
    parsedConfidence <= 1
      ? parsedConfidence
      : REPLY_INTENT_DEFAULT_MIN_CONFIDENCE;

  // Whether a provider is bound is the operator's platform setting (#4908),
  // read per call by TypedDecisionProviderResolver — not an env var, so it is
  // not this function's to answer. The classifier asks TypedDecisionService
  // before it spends a decision.
  return { minConfidence, mode };
}
