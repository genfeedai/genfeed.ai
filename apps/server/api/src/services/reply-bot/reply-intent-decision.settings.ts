/**
 * Rollout gate for the `reply_bot.intent` decision point (#4866).
 */

import type {
  IPlatformFeatureSettings,
  IReplyIntentDecisionSettings,
} from '@genfeedai/contracts/interfaces';

/**
 * Stable telemetry key. #4874 queries shadow-mode agreement by it, so it must
 * not change once a single row has been recorded.
 */
export const REPLY_INTENT_DECISION_POINT = 'reply_bot.intent';

/**
 * Reply-bot classification is an async path, so it takes the epic's 2s budget
 * rather than the 800ms the agent turn path runs on.
 */
export const REPLY_INTENT_DECISION_TIMEOUT_MS = 2_000;

/**
 * The mode and threshold are the `reply_bot_intent_decision` PostHog flag
 * (#5468). Whether a
 * provider is bound is a separate platform setting (#4908), read per call by
 * TypedDecisionProviderResolver — the classifier asks TypedDecisionService
 * before it spends a decision.
 */
export function resolveReplyIntentDecisionSettings(
  settings: IPlatformFeatureSettings,
): IReplyIntentDecisionSettings {
  return {
    minConfidence: settings.replyBotIntentMinConfidence,
    mode: settings.replyBotIntentDecisionMode,
  };
}
