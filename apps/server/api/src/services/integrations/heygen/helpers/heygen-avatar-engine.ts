import type { HeyGenNativeAvatar } from '@api/services/integrations/heygen/heygen-identity.types';
import {
  getEligibleHeyGenAvatarEngines,
  type HeyGenAvatarEngine,
} from '@genfeedai/contracts/constants';
import { BadRequestException } from '@nestjs/common';

/**
 * The `/v3/videos` engine fields for a native look, checked before the paid
 * submission: HeyGen answers 400 (or renders an engine we did not price)
 * otherwise. Avatar IV is HeyGen's default for `type: avatar`, so it is never
 * sent; Avatar V goes on the request as `engine: { type: 'avatar_v' }`.
 */
export function buildHeyGenAvatarEngineFields(
  avatar: HeyGenNativeAvatar,
  engine: HeyGenAvatarEngine,
): { engine?: { type: 'avatar_v' } } {
  if (!getEligibleHeyGenAvatarEngines(avatar).includes(engine))
    throw new BadRequestException(
      engine === 'avatar_v'
        ? 'Avatar V needs a digital-twin look that supports the Avatar V engine.'
        : 'This look does not support the Avatar IV engine.',
    );
  return engine === 'avatar_v' ? { engine: { type: engine } } : {};
}
