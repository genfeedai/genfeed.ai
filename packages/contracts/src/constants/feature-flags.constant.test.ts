import { describe, expect, it } from 'vitest';
import {
  APP_RAIL_FEATURE_FLAGS,
  DEFAULT_PLATFORM_FLAGS,
  isPlatformFlagKey,
  PLATFORM_FLAG_KEYS,
  PLATFORM_MODULE_FLAG_KEYS,
  parsePlatformFlags,
} from './feature-flags.constant';

describe('platform flags (#5468)', () => {
  it('defaults every flag on', () => {
    expect(Object.keys(DEFAULT_PLATFORM_FLAGS).sort()).toEqual(
      [...PLATFORM_FLAG_KEYS].sort(),
    );
    expect(Object.values(DEFAULT_PLATFORM_FLAGS).every(Boolean)).toBe(true);
  });

  it('turns a flag off only on an explicit false', () => {
    const flags = parsePlatformFlags({
      analytics: 'false',
      retired_flag: false,
      studio: false,
    });

    expect(flags.studio).toBe(false);
    expect(flags.analytics).toBe(true);
    expect(flags).not.toHaveProperty('retired_flag');
  });

  it.each([null, undefined, 'studio', [false]])(
    'keeps the defaults for a malformed column (%j)',
    (value) => {
      expect(parsePlatformFlags(value)).toEqual(DEFAULT_PLATFORM_FLAGS);
    },
  );

  it('gates every app-rail entry with a module flag', () => {
    for (const key of Object.values(APP_RAIL_FEATURE_FLAGS)) {
      expect(PLATFORM_MODULE_FLAG_KEYS).toContain(key);
    }
  });

  it('recognises only registered keys', () => {
    expect(isPlatformFlagKey('reply_bot')).toBe(true);
    expect(isPlatformFlagKey('app_switcher_studio')).toBe(false);
  });
});
