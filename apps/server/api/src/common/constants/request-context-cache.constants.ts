export const RC_PREFIX = 'rc';
export const RC_TTL = 900; // 15 minutes
export const RC_KEYS_SET_TTL = 960;

export function buildRcKey(
  userId: string,
  orgId: string,
  brandId?: string,
): string {
  return brandId
    ? `${RC_PREFIX}:${userId}:${orgId}:${brandId}`
    : `${RC_PREFIX}:${userId}:${orgId}`;
}

export function buildRcKeysSetKey(userId: string): string {
  return `${RC_PREFIX}:keys:${userId}`;
}
