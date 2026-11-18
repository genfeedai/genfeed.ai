import { describe, expect, it } from 'vitest';
import {
  type AvatarRenderQuality,
  getEligibleHeyGenAvatarEngines,
  getEligibleHeyGenAvatarModelKeys,
  getHeyGenAvatarEngine,
  isHeyGenAvatar6Engine,
  resolveAvatarRenderPlan,
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

describe('Avatar render quality plans', () => {
  const twinWithAvatar6 = look('digital_twin', [
    'avatar_iv',
    'avatar_v',
    'heygen-avatar-6',
    'heygen-avatar-6-turbo',
  ]);

  it.each([
    ['draft', { engine: 'avatar_iv' }],
    ['low', { engine: 'heygen-avatar-6-turbo', resolution: '1080p' }],
    ['medium', { engine: 'heygen-avatar-6', resolution: '1080p' }],
    ['high', { engine: 'heygen-avatar-6', resolution: '2k' }],
  ] as [AvatarRenderQuality, object][])(
    'renders a look that supports Avatar 6 at %s quality',
    (quality, plan) => {
      expect(resolveAvatarRenderPlan(twinWithAvatar6, quality)).toEqual({
        plan,
      });
    },
  );

  it('takes Turbo at 1080p without a choice when the look supports it', () => {
    expect(resolveAvatarRenderPlan(twinWithAvatar6)).toEqual({
      plan: { engine: 'heygen-avatar-6-turbo', resolution: '1080p' },
    });
  });

  it('takes Avatar IV without a choice when the look has no Avatar 6', () => {
    expect(
      resolveAvatarRenderPlan(look('photo_avatar', ['avatar_iv'])),
    ).toEqual({ plan: { engine: 'avatar_iv' } });
  });

  it.each(['low', 'medium', 'high'] as const)(
    'refuses %s quality on a look that lists no Avatar 6 engine',
    (quality) => {
      expect(
        resolveAvatarRenderPlan(look('studio_avatar', ['avatar_iv']), quality),
      ).toEqual({
        reason: `This look cannot render at ${quality} quality. Choose draft.`,
      });
    },
  );

  it('refuses medium quality on a look that lists Turbo only and names what it supports', () => {
    expect(
      resolveAvatarRenderPlan(
        look('studio_avatar', ['avatar_iv', 'heygen-avatar-6-turbo']),
        'medium',
      ),
    ).toEqual({
      reason: 'This look cannot render at medium quality. Choose draft, low.',
    });
  });

  it('takes standard Avatar 6 without a choice when the look has neither Turbo nor Avatar IV', () => {
    expect(
      resolveAvatarRenderPlan(look('digital_twin', ['heygen-avatar-6'])),
    ).toEqual({ plan: { engine: 'heygen-avatar-6', resolution: '1080p' } });
  });

  it('refuses draft on a look without Avatar IV and points at a supported tier', () => {
    expect(
      resolveAvatarRenderPlan(
        look('digital_twin', ['heygen-avatar-6-turbo']),
        'draft',
      ),
    ).toEqual({
      reason: 'This look cannot render at draft quality. Choose low.',
    });
  });

  it('refuses any tier on a look that lists no tier engine', () => {
    expect(resolveAvatarRenderPlan(look('digital_twin', ['avatar_v']))).toEqual(
      {
        reason:
          'This look supports none of the avatar quality tiers. Choose a different look.',
      },
    );
  });
});
