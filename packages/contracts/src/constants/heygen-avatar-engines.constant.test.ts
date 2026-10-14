import { describe, expect, it } from 'vitest';
import {
  getEligibleHeyGenAvatarEngines,
  getEligibleHeyGenAvatarModelKeys,
  getHeyGenAvatarEngine,
} from './heygen-avatar-engines.constant';
import { MODEL_KEYS } from './model-keys.constant';

const look = (avatarType: string | null, supportedEngines: string[]) => ({
  avatarType,
  supportedEngines,
});

describe('HeyGen avatar engine eligibility', () => {
  it('routes a photo avatar only to Avatar IV, even when it lists avatar_v', () => {
    expect(
      getEligibleHeyGenAvatarModelKeys(
        look('photo_avatar', ['avatar_iv', 'avatar_v']),
      ),
    ).toEqual([MODEL_KEYS.HEYGEN_AVATAR_IV]);
  });

  it('routes a digital twin with avatar_v to either engine', () => {
    expect(
      getEligibleHeyGenAvatarModelKeys(
        look('digital_twin', ['avatar_iv', 'avatar_v']),
      ),
    ).toEqual([MODEL_KEYS.HEYGEN_AVATAR_IV, MODEL_KEYS.HEYGEN_AVATAR_V]);
  });

  it('keeps a digital twin without avatar_v on Avatar IV', () => {
    expect(
      getEligibleHeyGenAvatarEngines(look('digital_twin', ['avatar_iv'])),
    ).toEqual(['avatar_iv']);
  });

  it('offers a studio avatar Avatar IV only', () => {
    expect(
      getEligibleHeyGenAvatarEngines(
        look('studio_avatar', ['avatar_iv', 'avatar_v']),
      ),
    ).toEqual(['avatar_iv']);
  });

  it.each([
    ['image', ['avatar_iv']],
    ['prompt', ['avatar_iv', 'avatar_v']],
    [null, ['avatar_iv']],
    ['digital_twin', []],
  ])('refuses an unpriced or engine-less look (%s)', (avatarType, engines) => {
    expect(getEligibleHeyGenAvatarEngines(look(avatarType, engines))).toEqual(
      [],
    );
  });

  it('maps catalog keys back to engines', () => {
    expect(getHeyGenAvatarEngine(MODEL_KEYS.HEYGEN_AVATAR_IV)).toBe(
      'avatar_iv',
    );
    expect(getHeyGenAvatarEngine(MODEL_KEYS.HEYGEN_AVATAR_V)).toBe('avatar_v');
    expect(getHeyGenAvatarEngine(MODEL_KEYS.HEYGEN_AVATAR)).toBeUndefined();
    expect(getHeyGenAvatarEngine(undefined)).toBeUndefined();
  });
});
