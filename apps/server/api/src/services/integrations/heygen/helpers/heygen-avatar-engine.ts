import type { HeyGenNativeAvatar } from '@api/services/integrations/heygen/heygen-identity.types';
import {
  getEligibleHeyGenAvatarEngines,
  HEYGEN_AVATAR_6_DEFAULT_RESOLUTION,
  type HeyGenAvatar6Resolution,
  type HeyGenAvatarEngine,
  isHeyGenAvatar6Engine,
} from '@genfeedai/contracts/constants';
import type { HeyGenAvatarMotion } from '@genfeedai/contracts/interfaces';
import { BadRequestException } from '@nestjs/common';

/** The engine-specific fields of a native `/v3/videos` avatar request. */
export interface HeyGenAvatarEngineFields {
  engine?: {
    type: Exclude<HeyGenAvatarEngine, 'avatar_iv'>;
    motion_expressiveness?: NonNullable<HeyGenAvatarMotion['expressiveness']>;
  };
  /** Set when the engine fixes the render resolution (Avatar 6 and Turbo). */
  resolution?: HeyGenAvatar6Resolution;
  /** Plain-language motion direction; Avatar 6 and Turbo only. */
  motion_prompt?: string;
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
 * and Turbo also send their own `resolution` (1080p unless 2K is chosen) because
 * HeyGen rejects 720p for them, and take the motion controls: `motion_prompt`
 * and `engine.motion_expressiveness`
 * (https://developers.heygen.com/docs/models/avatar-6).
 */
export function buildHeyGenAvatarEngineFields(
  avatar: HeyGenNativeAvatar,
  engine: HeyGenAvatarEngine,
  resolution: HeyGenAvatar6Resolution = HEYGEN_AVATAR_6_DEFAULT_RESOLUTION,
  motion?: HeyGenAvatarMotion,
): HeyGenAvatarEngineFields {
  if (!getEligibleHeyGenAvatarEngines(avatar).includes(engine))
    throw new BadRequestException(UNSUPPORTED_ENGINE_MESSAGES[engine]);
  if (!isHeyGenAvatar6Engine(engine)) {
    if (resolution !== HEYGEN_AVATAR_6_DEFAULT_RESOLUTION)
      throw new BadRequestException(
        `2K output needs Avatar 6 or Avatar 6 Turbo; ${engine} does not take a resolution.`,
      );
    if (motion?.prompt || motion?.expressiveness)
      throw new BadRequestException(
        `Motion controls need Avatar 6 or Avatar 6 Turbo; ${engine} does not take them.`,
      );
    return engine === 'avatar_iv' ? {} : { engine: { type: engine } };
  }
  return {
    engine: {
      type: engine,
      ...(motion?.expressiveness
        ? { motion_expressiveness: motion.expressiveness }
        : {}),
    },
    resolution,
    ...(motion?.prompt ? { motion_prompt: motion.prompt } : {}),
  };
}
