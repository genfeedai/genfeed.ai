import { createHash } from 'node:crypto';

const BLOCK_PREFIX = 'removed:';
const LEADING_AT = /^@/;

/**
 * The id a removed creator's row carries. It is a hash of the platform and
 * handle, so the block that keeps the creator out of seeding and the weekly
 * read holds no name: the request is recorded and the removed data is not.
 */
export function outlierBlockKey(platform: string, handle: string): string {
  const normalized = handle.trim().replace(LEADING_AT, '').toLowerCase();
  return `${BLOCK_PREFIX}${createHash('sha256')
    .update(`${platform}:${normalized}`)
    .digest('hex')}`;
}
