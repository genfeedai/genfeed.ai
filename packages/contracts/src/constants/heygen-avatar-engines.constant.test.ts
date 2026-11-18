import { describe, expect, it } from 'vitest';
import {
  getEligibleHeyGenAvatarEngines,
  getEligibleHeyGenAvatarModelKeys,
  getHeyGenAvatarEngine,
  isHeyGenAvatar6Engine,
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

  it.each(['photo_avatar', 'digital_twin', 'studio_avatar'])(
    'offers a %s look both Avatar 6 engines once HeyGen lists them',
    (avatarType) => {
      expect(
        getEligibleHeyGenAvatarModelKeys(
          look(avatarType, ['heygen-avatar-6', 'heygen-avatar-6-turbo']),
        ),
      ).toEqual([MODEL_KEYS.HEYGEN_AVATAR_6, MODEL_KEYS.HEYGEN_AVATAR_6_TURBO]);
    },
  );

  it('does not offer Avatar 6 to a look that does not list it', () => {
    expect(
      getEligibleHeyGenAvatarEngines(
        look('digital_twin', ['avatar_iv', 'avatar_v']),
      ),
    ).toEqual(['avatar_iv', 'avatar_v']);
  });

  it('lists Avatar 6 after the older engines for a fully supported twin', () => {
    expect(
      getEligibleHeyGenAvatarEngines(
        look('digital_twin', [
          'avatar_iv',
          'avatar_v',
          'heygen-avatar-6',
          'heygen-avatar-6-turbo',
        ]),
      ),
    ).toEqual([
      'avatar_iv',
      'avatar_v',
      'heygen-avatar-6',
      'heygen-avatar-6-turbo',
    ]);
  });

  it('recognises the two Avatar 6 engines only', () => {
    expect(isHeyGenAvatar6Engine('heygen-avatar-6')).toBe(true);
    expect(isHeyGenAvatar6Engine('heygen-avatar-6-turbo')).toBe(true);
    expect(isHeyGenAvatar6Engine('avatar_v')).toBe(false);
    expect(isHeyGenAvatar6Engine(undefined)).toBe(false);
  });

  it('maps catalog keys back to engines', () => {
    expect(getHeyGenAvatarEngine(MODEL_KEYS.HEYGEN_AVATAR_6)).toBe(
      'heygen-avatar-6',
    );
    expect(getHeyGenAvatarEngine(MODEL_KEYS.HEYGEN_AVATAR_6_TURBO)).toBe(
      'heygen-avatar-6-turbo',
    );
    expect(getHeyGenAvatarEngine(MODEL_KEYS.HEYGEN_AVATAR_IV)).toBe(
      'avatar_iv',
    );
    expect(getHeyGenAvatarEngine(MODEL_KEYS.HEYGEN_AVATAR_V)).toBe('avatar_v');
    expect(getHeyGenAvatarEngine(MODEL_KEYS.HEYGEN_AVATAR)).toBeUndefined();
    expect(getHeyGenAvatarEngine(undefined)).toBeUndefined();
  });
});
