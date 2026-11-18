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
 * The output resolutions HeyGen accepts for Avatar 6 and Turbo; `720p` and `4k`
 * are rejected (https://developers.heygen.com/docs/models/avatar-6). Each has
 * its own reviewed per-second rate.
 */
export const HEYGEN_AVATAR_6_RESOLUTIONS = ['1080p', '2k'] as const;
export type HeyGenAvatar6Resolution =
  (typeof HEYGEN_AVATAR_6_RESOLUTIONS)[number];

/** The `engine.motion_expressiveness` values HeyGen accepts for Avatar 6. */
export const HEYGEN_AVATAR_MOTION_EXPRESSIVENESS = ['default', 'less'] as const;

/** `motion_prompt` is capped at 1,200 characters on HeyGen's Model API. */
export const HEYGEN_AVATAR_MOTION_PROMPT_MAX_LENGTH = 1200;

/** HeyGen's default for Avatar 6, and what a render without a choice uses. */
export const HEYGEN_AVATAR_6_DEFAULT_RESOLUTION: HeyGenAvatar6Resolution =
  '1080p';

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

/**
 * The quality picker for a trained-look avatar render. `draft` is Avatar IV,
 * which only looks listing it support; the other three are Avatar 6 and its
 * Turbo variant at a resolution HeyGen accepts. Each plan names one engine and one reviewed
 * rate, so the price shown, the hold and the request cannot diverge.
 */
export const AVATAR_RENDER_QUALITIES = [
  'draft',
  'low',
  'medium',
  'high',
] as const;
export type AvatarRenderQuality = (typeof AVATAR_RENDER_QUALITIES)[number];

export interface AvatarRenderPlan {
  engine: HeyGenAvatarEngine;
  /**
   * Avatar 6 and Turbo take this resolution. Avatar IV takes none from the
   * plan, so the native request uses its aspect-ratio default.
   */
  resolution?: HeyGenAvatar6Resolution;
}

export const AVATAR_RENDER_QUALITY_PLANS: Readonly<
  Record<AvatarRenderQuality, AvatarRenderPlan>
> = {
  draft: { engine: 'avatar_iv' },
  low: { engine: 'heygen-avatar-6-turbo', resolution: '1080p' },
  medium: { engine: 'heygen-avatar-6', resolution: '1080p' },
  high: { engine: 'heygen-avatar-6', resolution: '2k' },
};

const AUTO_QUALITY_ORDER: readonly AvatarRenderQuality[] = [
  'low',
  'medium',
  'draft',
];

/**
 * The plan a quality picks for a look, or the reason the look cannot render it.
 * Without a choice the render takes the first plan the look supports: `low`
 * (Avatar 6 Turbo, cheaper than Avatar IV on a trained look), then `medium`,
 * then `draft`.
 */
export function resolveAvatarRenderPlan(
  look: Pick<HeyGenAvatarRef, 'avatarType' | 'supportedEngines'>,
  quality?: AvatarRenderQuality,
): { plan: AvatarRenderPlan } | { reason: string } {
  const eligible = getEligibleHeyGenAvatarEngines(look);
  const supported = AVATAR_RENDER_QUALITIES.filter((tier) =>
    eligible.includes(AVATAR_RENDER_QUALITY_PLANS[tier].engine),
  );
  const chosen =
    quality ?? AUTO_QUALITY_ORDER.find((tier) => supported.includes(tier));
  if (chosen && supported.includes(chosen))
    return { plan: AVATAR_RENDER_QUALITY_PLANS[chosen] };
  const hint =
    supported.length > 0
      ? `Choose ${supported.join(', ')}.`
      : 'Choose a different look.';
  return {
    reason: quality
      ? `This look cannot render at ${quality} quality. ${hint}`
      : `This look supports none of the avatar quality tiers. ${hint}`,
  };
}
