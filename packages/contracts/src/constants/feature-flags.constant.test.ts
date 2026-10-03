import { describe, expect, it } from 'vitest';
import {
  APP_RAIL_FEATURE_FLAGS,
  DEFAULT_PLATFORM_FLAGS,
  getPlatformFlagChildren,
  isPlatformFlagKey,
  PLATFORM_FLAG_KEYS,
  PLATFORM_FLAG_PARENTS,
  PLATFORM_MODULE_FLAG_KEYS,
  PLATFORM_STUDIO_FLAG_KEYS,
  parsePlatformFlags,
  resolvePlatformFlags,
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

  it('nests every Studio surface under the studio module', () => {
    expect(getPlatformFlagChildren('studio')).toEqual([
      ...PLATFORM_STUDIO_FLAG_KEYS,
    ]);
    expect(getPlatformFlagChildren('studio_batch')).toEqual(['batch_ideas']);
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
      parsePlatformFlags({ studio: false, studio_motion: true }),
    );

    expect(flags.studio).toBe(false);
    expect(flags.studio_motion).toBe(false);
    expect(flags.studio_batch).toBe(false);
    expect(flags.batch_ideas).toBe(false);
    expect(flags.library_canvas).toBe(true);
  });

  it('keeps a parent on when only a nested flag is off', () => {
    const flags = resolvePlatformFlags(
      parsePlatformFlags({ studio_batch: false }),
    );

    expect(flags.studio).toBe(true);
    expect(flags.studio_motion).toBe(true);
    expect(flags.studio_batch).toBe(false);
    expect(flags.batch_ideas).toBe(false);
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
