import {
  REPLY_INTENT_DECISION_POINT,
  REPLY_INTENT_DECISION_TIMEOUT_MS,
  resolveReplyIntentDecisionSettings,
} from '@api/services/reply-bot/reply-intent-decision.settings';
import { DEFAULT_PLATFORM_FEATURE_SETTINGS } from '@genfeedai/contracts/constants';
import { describe, expect, it } from 'vitest';

describe('resolveReplyIntentDecisionSettings', () => {
  it('is off at the conservative default before an operator changes it', () => {
    expect(
      resolveReplyIntentDecisionSettings(DEFAULT_PLATFORM_FEATURE_SETTINGS),
    ).toEqual({ minConfidence: 0.85, mode: 'off' });
  });

  it('reads the mode and the threshold', () => {
    expect(
      resolveReplyIntentDecisionSettings({
        ...DEFAULT_PLATFORM_FEATURE_SETTINGS,
        replyBotIntentDecisionMode: 'live',
        replyBotIntentMinConfidence: 0.7,
      }),
    ).toEqual({ minConfidence: 0.7, mode: 'live' });
  });

  it('pins the telemetry key and the async budget', () => {
    expect(REPLY_INTENT_DECISION_POINT).toBe('reply_bot.intent');
    expect(REPLY_INTENT_DECISION_TIMEOUT_MS).toBe(2_000);
  });
});
