import { describe, expect, it } from 'vitest';
import {
  APP_RAIL_FEATURE_FLAG_KEYS,
  DESKTOP_LOCAL_WORKSPACE_FEATURE_FLAG,
  REPLY_BOT_FEATURE_FLAG,
} from './feature-flags.constant';

describe('feature-flags.constant', () => {
  it('renames the rail symbols without changing deployed PostHog keys', () => {
    expect([...APP_RAIL_FEATURE_FLAG_KEYS].sort()).toEqual([
      'app_switcher_agent',
      'app_switcher_analytics',
      'app_switcher_automate',
      'app_switcher_discover',
      'app_switcher_library',
      'app_switcher_messages',
      'app_switcher_posts',
      'app_switcher_studio',
      'app_switcher_workspace',
    ]);
  });

  it('keeps the Replies PostHog key stable', () => {
    expect(REPLY_BOT_FEATURE_FLAG).toBe('reply_bot');
    expect(APP_RAIL_FEATURE_FLAG_KEYS).not.toContain(REPLY_BOT_FEATURE_FLAG);
  });

  it('keeps the desktop local-workspace PostHog key stable', () => {
    expect(DESKTOP_LOCAL_WORKSPACE_FEATURE_FLAG).toBe(
      'desktop_local_workspace',
    );
  });
});
