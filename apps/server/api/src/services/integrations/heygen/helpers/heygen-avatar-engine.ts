import type { HeyGenNativeAvatar } from '@api/services/integrations/heygen/heygen-identity.types';
import {
  getEligibleHeyGenAvatarEngines,
  HEYGEN_AVATAR_6_RENDER_RESOLUTION,
  type HeyGenAvatarEngine,
  isHeyGenAvatar6Engine,
} from '@genfeedai/contracts/constants';
import { BadRequestException } from '@nestjs/common';

/** The engine-specific fields of a native `/v3/videos` avatar request. */
export interface HeyGenAvatarEngineFields {
  engine?: { type: Exclude<HeyGenAvatarEngine, 'avatar_iv'> };
  /** Set when the engine fixes the render resolution (Avatar 6 and Turbo). */
  resolution?: typeof HEYGEN_AVATAR_6_RENDER_RESOLUTION;
}

const UNSUPPORTED_ENGINE_MESSAGES: Readonly<
  Record<HeyGenAvatarEngine, string>
> = {
  avatar_iv: 'This look does not support the Avatar IV engine.',
  avatar_v:
    'Avatar V needs a digital-twin look that supports the Avatar V engine.',
  'heygen-avatar-6': 'This look does not support the Avatar 6 engine.',
  'heygen-avatar-6-turbo':
    'This look does not support the Avatar 6 Turbo engine.',
};

/**
 * The `/v3/videos` engine fields for a native look, checked before the paid
 * submission: HeyGen answers 400 (or renders an engine we did not price)
 * otherwise. Avatar IV is HeyGen's default for `type: avatar`, so it is never
 * sent; every other engine goes on the request as `engine: { type }`. Avatar 6
 * and Turbo also pin `resolution: '1080p'` because HeyGen rejects 720p for them
 * (https://developers.heygen.com/docs/models/avatar-6).
 */
export function buildHeyGenAvatarEngineFields(
  avatar: HeyGenNativeAvatar,
  engine: HeyGenAvatarEngine,
): HeyGenAvatarEngineFields {
  if (!getEligibleHeyGenAvatarEngines(avatar).includes(engine))
    throw new BadRequestException(UNSUPPORTED_ENGINE_MESSAGES[engine]);
  if (engine === 'avatar_iv') return {};
  return {
    engine: { type: engine },
    ...(isHeyGenAvatar6Engine(engine)
      ? { resolution: HEYGEN_AVATAR_6_RENDER_RESOLUTION }
      : {}),
  };
}
