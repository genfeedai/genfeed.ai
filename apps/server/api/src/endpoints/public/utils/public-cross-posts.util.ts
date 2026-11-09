/**
 * A post published to the Genfeed profile usually went out to the networks
 * from the same composer submit. Each channel is its own post row, with no
 * shared id, so the profile pairs them by what they say and when they went
 * live: the same opening text within two days.
 */

const HTML_TAG_PATTERN = /<[^>]+>/g;
const HTML_ENTITY_PATTERN = /&(?:nbsp|amp|lt|gt|quot|#39);/g;
const WHITESPACE_PATTERN = /\s+/g;
const HTML_ENTITIES: Record<string, string> = {
  '&#39;': "'",
  '&amp;': '&',
  '&gt;': '>',
  '&lt;': '<',
  '&nbsp;': ' ',
  '&quot;': '"',
};

/** Characters of opening text two posts must share to be the same post. */
export const CROSS_POST_TEXT_PREFIX_LENGTH = 80;
/** How far apart two channels may have gone live and still be one post. */
export const CROSS_POST_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;

export interface CrossPostCandidate {
  createdAt?: Date | string | null;
  description?: string | null;
  id: string;
  platform?: string | null;
  publishedAt?: Date | string | null;
  url?: string | null;
}

export interface PublicCrossPost {
  platform: string;
  url: string;
}

/** The opening text of a caption, without markup, case or spacing. */
export function crossPostTextKey(
  description: string | null | undefined,
): string {
  return (description ?? '')
    .replace(HTML_TAG_PATTERN, ' ')
    .replace(HTML_ENTITY_PATTERN, (entity) => HTML_ENTITIES[entity] ?? ' ')
    .replace(WHITESPACE_PATTERN, ' ')
    .trim()
    .toLowerCase()
    .slice(0, CROSS_POST_TEXT_PREFIX_LENGTH);
}

function liveAt(post: CrossPostCandidate): number {
  const value = post.publishedAt ?? post.createdAt;
  return value ? new Date(value).getTime() : Number.NaN;
}

function isTwin(
  native: CrossPostCandidate,
  other: CrossPostCandidate,
): boolean {
  const nativeKey = crossPostTextKey(native.description);
  if (!nativeKey || nativeKey !== crossPostTextKey(other.description)) {
    return false;
  }
  const distance = Math.abs(liveAt(native) - liveAt(other));
  return Number.isFinite(distance) && distance <= CROSS_POST_WINDOW_MS;
}

/** The network posts that are copies of one of the native posts. */
export function findCrossPostIds(
  natives: readonly CrossPostCandidate[],
  networkPosts: readonly CrossPostCandidate[],
): string[] {
  return networkPosts
    .filter((post) => natives.some((native) => isTwin(native, post)))
    .map((post) => post.id);
}

/** Where a native post also went live, one link per network. */
export function listCrossPosts(
  native: CrossPostCandidate,
  networkPosts: readonly CrossPostCandidate[],
): PublicCrossPost[] {
  const byPlatform = new Map<string, PublicCrossPost>();
  for (const post of networkPosts) {
    if (!post.platform || !post.url || byPlatform.has(post.platform)) {
      continue;
    }
    if (isTwin(native, post)) {
      byPlatform.set(post.platform, { platform: post.platform, url: post.url });
    }
  }
  return [...byPlatform.values()];
}
