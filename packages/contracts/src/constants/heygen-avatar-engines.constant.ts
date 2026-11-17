import type { HeyGenAvatarRef } from '../interfaces/integrations/heygen.interface';
import { MODEL_KEYS } from './model-keys.constant';

/**
 * The HeyGen `/v3/videos` engines Genfeed prices and routes. Each value is the
 * exact `engine.type` HeyGen accepts and the id its looks list in
 * `supported_api_engines` (https://developers.heygen.com/models).
 */
export type HeyGenAvatarEngine =
  | 'avatar_iv'
  | 'avatar_v'
  | 'heygen-avatar-6'
  | 'heygen-avatar-6-turbo';

/** Look types with a verified Avatar IV price (HeyGen pricing page, 2026-10-10). */
export const HEYGEN_AVATAR_IV_PRICED_TYPES: readonly string[] = [
  'photo_avatar',
  'digital_twin',
  'studio_avatar',
];

/** Avatar V renders only a digital twin (custom video avatar). */
export const HEYGEN_AVATAR_V_PRICED_TYPES: readonly string[] = ['digital_twin'];

/**
 * Avatar 6 renders at 1080p, HeyGen's default. `720p` is rejected for it, and
 * `2k` is a separate reviewed rate Genfeed does not offer yet.
 */
export const HEYGEN_AVATAR_6_RENDER_RESOLUTION = '1080p';

export const HEYGEN_AVATAR_ENGINE_MODEL_KEYS: Readonly<
  Record<HeyGenAvatarEngine, string>
> = {
  avatar_iv: MODEL_KEYS.HEYGEN_AVATAR_IV,
  avatar_v: MODEL_KEYS.HEYGEN_AVATAR_V,
  'heygen-avatar-6': MODEL_KEYS.HEYGEN_AVATAR_6,
  'heygen-avatar-6-turbo': MODEL_KEYS.HEYGEN_AVATAR_6_TURBO,
};

/** The engine a catalog model key selects, or undefined for a non-engine key. */
export function getHeyGenAvatarEngine(
  modelKey: string | null | undefined,
): HeyGenAvatarEngine | undefined {
  return (
    Object.entries(HEYGEN_AVATAR_ENGINE_MODEL_KEYS) as [
      HeyGenAvatarEngine,
      string,
    ][]
  ).find(([, key]) => key === modelKey)?.[0];
}

/**
 * Avatar 6 and its Turbo variant are priced by output resolution alone, so the
 * look's type does not gate them: a look is eligible once HeyGen lists the
 * engine in its `supported_api_engines`.
 */
export function isHeyGenAvatar6Engine(
  engine: HeyGenAvatarEngine | undefined,
): engine is 'heygen-avatar-6' | 'heygen-avatar-6-turbo' {
  return engine === 'heygen-avatar-6' || engine === 'heygen-avatar-6-turbo';
}

/**
 * Engines a look can render with a verified price. HeyGen answers 400 when an
 * engine is requested for a look that does not list it in
 * `supported_api_engines`, and `avatar_v` also needs a digital twin, so both
 * conditions gate it before paid submission.
 */
export function getEligibleHeyGenAvatarEngines(
  look: Pick<HeyGenAvatarRef, 'avatarType' | 'supportedEngines'>,
): HeyGenAvatarEngine[] {
  const avatarType = look.avatarType ?? '';
  const engines: HeyGenAvatarEngine[] = [];
  if (
    look.supportedEngines.includes('avatar_iv') &&
    HEYGEN_AVATAR_IV_PRICED_TYPES.includes(avatarType)
  )
    engines.push('avatar_iv');
  if (
    look.supportedEngines.includes('avatar_v') &&
    HEYGEN_AVATAR_V_PRICED_TYPES.includes(avatarType)
  )
    engines.push('avatar_v');
  if (look.supportedEngines.includes('heygen-avatar-6'))
    engines.push('heygen-avatar-6');
  if (look.supportedEngines.includes('heygen-avatar-6-turbo'))
    engines.push('heygen-avatar-6-turbo');
  return engines;
}

/** Catalog keys Auto may route a look to, in engine order. */
export function getEligibleHeyGenAvatarModelKeys(
  look: Pick<HeyGenAvatarRef, 'avatarType' | 'supportedEngines'>,
): string[] {
  return getEligibleHeyGenAvatarEngines(look).map(
    (engine) => HEYGEN_AVATAR_ENGINE_MODEL_KEYS[engine],
  );
}
