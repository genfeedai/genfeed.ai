import { describe, expect, it } from 'vitest';
import {
  APP_RAIL_FEATURE_FLAGS,
  DEFAULT_PLATFORM_FLAGS,
  getPlatformFlagChildren,
  isPlatformFlagKey,
  PLATFORM_FLAG_KEYS,
  PLATFORM_FLAG_PARENTS,
  PLATFORM_MODULE_FLAG_KEYS,
  parsePlatformFlags,
  resolvePlatformFlags,
} from './feature-flags.constant';
import {
  PLATFORM_RELEASE_FLAG_KEYS,
  type PlatformReleaseFlagKey,
} from './release-items.constant';

describe('platform flags (#5468)', () => {
  it('defaults every module and feature flag on and every release off', () => {
    expect(Object.keys(DEFAULT_PLATFORM_FLAGS).sort()).toEqual(
      [...PLATFORM_FLAG_KEYS].sort(),
    );
    for (const key of PLATFORM_FLAG_KEYS) {
      expect(DEFAULT_PLATFORM_FLAGS[key]).toBe(
        !PLATFORM_RELEASE_FLAG_KEYS.includes(key as PlatformReleaseFlagKey),
      );
    }
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

  it('gives each Studio app its own module flag, not nested under studio', () => {
    for (const key of ['storyboard', 'turbo', 'motion', 'clipper', 'editor']) {
      expect(PLATFORM_MODULE_FLAG_KEYS).toContain(key);
      expect(PLATFORM_FLAG_PARENTS).not.toHaveProperty(key);
    }
    expect(getPlatformFlagChildren('studio')).toEqual([]);
    expect(getPlatformFlagChildren('turbo')).toEqual(['turbo_ideas']);
    expect(getPlatformFlagChildren('agent')).toEqual([]);
  });

  it('only nests registered flags under registered parents', () => {
    for (const [child, parent] of Object.entries(PLATFORM_FLAG_PARENTS)) {
      expect(isPlatformFlagKey(child)).toBe(true);
      expect(isPlatformFlagKey(parent)).toBe(true);
    }
  });

  it('turns a nested flag off while any flag above it is off', () => {
    const flags = resolvePlatformFlags(
      parsePlatformFlags({ library: false, turbo: true }),
    );

    expect(flags.library).toBe(false);
    expect(flags.library_canvas).toBe(false);
    expect(flags.turbo).toBe(true);
    expect(flags.turbo_ideas).toBe(true);
  });

  it('keeps a parent on when only a nested flag is off', () => {
    const flags = resolvePlatformFlags(parsePlatformFlags({ turbo: false }));

    expect(flags.studio).toBe(true);
    expect(flags.motion).toBe(true);
    expect(flags.turbo).toBe(false);
    expect(flags.turbo_ideas).toBe(false);
  });

  it('leaves the defaults all on', () => {
    expect(resolvePlatformFlags(DEFAULT_PLATFORM_FLAGS)).toEqual(
      DEFAULT_PLATFORM_FLAGS,
    );
  });

  it('recognises only registered keys', () => {
    expect(isPlatformFlagKey('reply_bot')).toBe(true);
    expect(isPlatformFlagKey('app_switcher_studio')).toBe(false);
  });
});
