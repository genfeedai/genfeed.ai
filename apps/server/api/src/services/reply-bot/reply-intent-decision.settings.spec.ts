import {
  REPLY_INTENT_DECISION_POINT,
  REPLY_INTENT_DEFAULT_MIN_CONFIDENCE,
  resolveReplyIntentDecisionSettings,
} from '@api/services/reply-bot/reply-intent-decision.settings';
import type { ConfigService } from '@libs/config/config.service';
import { describe, expect, it, vi } from 'vitest';

function configOf(env: Record<string, string | number>): ConfigService {
  return {
    get: vi.fn((key: string) => env[key] ?? ''),
  } as unknown as ConfigService;
}

describe('resolveReplyIntentDecisionSettings', () => {
  it('is off at the conservative default with nothing configured', () => {
    expect(resolveReplyIntentDecisionSettings(configOf({}))).toEqual({
      minConfidence: REPLY_INTENT_DEFAULT_MIN_CONFIDENCE,
      mode: 'off',
    });
  });

  it('reads the mode and the threshold', () => {
    expect(
      resolveReplyIntentDecisionSettings(
        configOf({
          REPLY_BOT_INTENT_DECISION_MODE: 'live',
          REPLY_BOT_INTENT_MIN_CONFIDENCE: 0.7,
        }),
      ),
    ).toEqual({ minConfidence: 0.7, mode: 'live' });
  });

  it('rejects a mode it does not recognise', () => {
    expect(
      resolveReplyIntentDecisionSettings(
        configOf({
          REPLY_BOT_INTENT_DECISION_MODE: 'on',
        }),
      ).mode,
    ).toBe('off');
  });

  it.each([-0.1, 1.5, Number.NaN, 'high'])(
    'falls back to the default threshold for %p',
    (value) => {
      expect(
        resolveReplyIntentDecisionSettings(
          configOf({
            REPLY_BOT_INTENT_MIN_CONFIDENCE: value as number,
          }),
        ).minConfidence,
      ).toBe(REPLY_INTENT_DEFAULT_MIN_CONFIDENCE);
    },
  );

  it('pins the telemetry key #4874 queries agreement by', () => {
    expect(REPLY_INTENT_DECISION_POINT).toBe('reply_bot.intent');
  });
});
