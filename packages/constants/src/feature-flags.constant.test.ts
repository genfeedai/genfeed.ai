import { describe, expect, it } from 'vitest';
import {
  APP_SWITCHER_FEATURE_FLAG_KEYS,
  REPLY_BOT_FEATURE_FLAG,
} from './feature-flags.constant';

describe('feature-flags.constant', () => {
  it('keeps the Replies PostHog key stable', () => {
    expect(REPLY_BOT_FEATURE_FLAG).toBe('reply_bot');
    expect(APP_SWITCHER_FEATURE_FLAG_KEYS).not.toContain(
      REPLY_BOT_FEATURE_FLAG,
    );
  });
});
