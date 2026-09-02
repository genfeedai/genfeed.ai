import { describe, expect, it } from 'vitest';
import {
  APP_SWITCHER_FEATURE_FLAG_KEYS,
  DESKTOP_LOCAL_WORKSPACE_FEATURE_FLAG,
  REPLY_BOT_FEATURE_FLAG,
} from './feature-flags.constant';

describe('feature-flags.constant', () => {
  it('keeps the Replies PostHog key stable', () => {
    expect(REPLY_BOT_FEATURE_FLAG).toBe('reply_bot');
    expect(APP_SWITCHER_FEATURE_FLAG_KEYS).not.toContain(
      REPLY_BOT_FEATURE_FLAG,
    );
  });

  it('keeps the desktop local-workspace PostHog key stable', () => {
    expect(DESKTOP_LOCAL_WORKSPACE_FEATURE_FLAG).toBe(
      'desktop_local_workspace',
    );
  });
});
