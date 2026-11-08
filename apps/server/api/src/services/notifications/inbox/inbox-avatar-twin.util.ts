import { AVATAR_TWIN_NOTIFICATION_KIND } from '@api/collections/avatar-twins/utils/avatar-twin-tracking.util';
import type { Prisma } from '@genfeedai/prisma';

/** A settled digital twin; the inbox item opens the twin page in its brand. */
export function readAvatarTwinPayload(
  topic: string,
  payload: Prisma.JsonValue,
): { brandId: string } | null {
  if (
    topic !== 'generation.status' ||
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload) ||
    payload.kind !== AVATAR_TWIN_NOTIFICATION_KIND ||
    payload.version !== 1 ||
    typeof payload.brandId !== 'string' ||
    payload.brandId.length === 0
  ) {
    return null;
  }
  return { brandId: payload.brandId };
}
