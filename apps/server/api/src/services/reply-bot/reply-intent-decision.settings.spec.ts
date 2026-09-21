import {
  REPLY_INTENT_DECISION_POINT,
  REPLY_INTENT_DEFAULT_MIN_CONFIDENCE,
  resolveReplyIntentDecisionSettings,
} from '@api/services/reply-bot/reply-intent-decision.settings';
import { UNCONFIGURED_SECRET_SENTINEL } from '@genfeedai/config';
import type { ConfigService } from '@libs/config/config.service';
import { describe, expect, it, vi } from 'vitest';

function configOf(env: Record<string, string | number>): ConfigService {
  return {
    get: vi.fn((key: string) => env[key] ?? ''),
  } as unknown as ConfigService;
}

const BOUND_PROVIDER = {
  TYPED_DECISION_PROVIDER: 'jev',
  TYPESAFE_API_KEY: 'fake-key-for-tests',
};

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
          ...BOUND_PROVIDER,
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
          ...BOUND_PROVIDER,
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
            ...BOUND_PROVIDER,
            REPLY_BOT_INTENT_MIN_CONFIDENCE: value as number,
          }),
        ).minConfidence,
      ).toBe(REPLY_INTENT_DEFAULT_MIN_CONFIDENCE);
    },
  );

  it('degrades to off when no provider is bound', () => {
    expect(
      resolveReplyIntentDecisionSettings(
        configOf({
          REPLY_BOT_INTENT_DECISION_MODE: 'live',
          TYPED_DECISION_PROVIDER: 'none',
        }),
      ).mode,
    ).toBe('off');
  });

  it('degrades to off when the vendor key is a placeholder', () => {
    expect(
      resolveReplyIntentDecisionSettings(
        configOf({
          REPLY_BOT_INTENT_DECISION_MODE: 'shadow',
          TYPED_DECISION_PROVIDER: 'jev',
          TYPESAFE_API_KEY: UNCONFIGURED_SECRET_SENTINEL,
        }),
      ).mode,
    ).toBe('off');
  });

  it('pins the telemetry key #4874 queries agreement by', () => {
    expect(REPLY_INTENT_DECISION_POINT).toBe('reply_bot.intent');
  });
});
