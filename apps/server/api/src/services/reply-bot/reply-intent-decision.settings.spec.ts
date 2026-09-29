import {
  REPLY_INTENT_DECISION_POINT,
  REPLY_INTENT_DECISION_TIMEOUT_MS,
} from '@api/services/reply-bot/reply-intent-decision.settings';
import { describe, expect, it } from 'vitest';

describe('resolveReplyIntentDecisionSettings', () => {
  it('pins the telemetry key and the async budget', () => {
    expect(REPLY_INTENT_DECISION_POINT).toBe('reply_bot.intent');
    expect(REPLY_INTENT_DECISION_TIMEOUT_MS).toBe(2_000);
  });
});
