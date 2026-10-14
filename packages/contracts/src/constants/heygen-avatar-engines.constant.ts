import type { HeyGenAvatarRef } from '../interfaces/integrations/heygen.interface';
import { MODEL_KEYS } from './model-keys.constant';

/** The HeyGen `/v3/videos` engines Genfeed prices and routes. */
export type HeyGenAvatarEngine = 'avatar_iv' | 'avatar_v';

/** Look types with a verified Avatar IV price (HeyGen pricing page, 2026-10-10). */
export const HEYGEN_AVATAR_IV_PRICED_TYPES: readonly string[] = [
  'photo_avatar',
  'digital_twin',
  'studio_avatar',
];

/** Avatar V renders only a digital twin (custom video avatar). */
export const HEYGEN_AVATAR_V_PRICED_TYPES: readonly string[] = ['digital_twin'];

export const HEYGEN_AVATAR_ENGINE_MODEL_KEYS: Readonly<
  Record<HeyGenAvatarEngine, string>
> = {
  avatar_iv: MODEL_KEYS.HEYGEN_AVATAR_IV,
  avatar_v: MODEL_KEYS.HEYGEN_AVATAR_V,
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
 * Engines a look can render with a verified price. HeyGen answers 400 when
 * `avatar_v` is requested for anything but a digital twin that lists it in
 * `supported_api_engines`, so both conditions gate it before paid submission.
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
