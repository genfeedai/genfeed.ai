/**
 * Rollout gate for the `reply_bot.intent` decision point (#4866).
 *
 * One function, one file — #4912 replaces every resolver of this shape with a
 * settings service, so nothing else belongs here.
 */

import { JEV_TYPED_DECISION_PROVIDER_NAME } from '@api/services/typed-decisions/typed-decisions.constants';
import { isUnconfiguredSecret } from '@genfeedai/config';
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

  // "WHEN the provider is unavailable THE SYSTEM SHALL behave as `off`"
  // (#4866). An install that binds no decision provider — every self-host —
  // can never produce an answer, so it must not queue every comment for review
  // for want of one. Mirrors createTypedDecisionProvider's binding condition.
  // A *runtime* failure with a provider bound is a different thing, and the
  // classifier treats it exactly like a sub-threshold answer.
  const apiKey = String(configService.get('TYPESAFE_API_KEY') || '').trim();
  const hasProvider =
    String(configService.get('TYPED_DECISION_PROVIDER') || '').trim() ===
      JEV_TYPED_DECISION_PROVIDER_NAME &&
    Boolean(apiKey) &&
    !isUnconfiguredSecret(apiKey);

  return { minConfidence, mode: hasProvider ? mode : 'off' };
}
