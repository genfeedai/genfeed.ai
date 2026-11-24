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
const CROSS_POST_TEXT_PREFIX_LENGTH = 80;
/** How far apart two channels may have gone live and still be one post. */
const CROSS_POST_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;

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

/** Raw characters read first; a caption with more is only read whole if they are not enough. */
const CROSS_POST_SCAN_LENGTH = 240;
/** The longest entity the key decodes, `&nbsp;`. */
const LONGEST_ENTITY_LENGTH = 6;

function normaliseCaption(description: string): string {
  return description
    .replace(HTML_TAG_PATTERN, ' ')
    .replace(HTML_ENTITY_PATTERN, (entity) => HTML_ENTITIES[entity] ?? ' ')
    .replace(WHITESPACE_PATTERN, ' ')
    .trim()
    .toLowerCase();
}

/**
 * The start of a long caption, cut where it stops being the same text the
 * whole caption would give: before a tag or entity that is still open.
 */
function exactCaptionHead(description: string): string {
  let head = description.slice(0, CROSS_POST_SCAN_LENGTH);
  const openTag = head.indexOf('<', head.lastIndexOf('>') + 1);
  if (openTag >= 0) head = head.slice(0, openTag);
  const openEntity = head.lastIndexOf('&');
  if (
    openEntity >= head.length - LONGEST_ENTITY_LENGTH &&
    !head.includes(';', openEntity)
  ) {
    head = head.slice(0, openEntity);
  }
  return head;
}

/** The opening text of a caption, without markup, case or spacing. */
export function crossPostTextKey(
  description: string | null | undefined,
): string {
  const caption = description ?? '';
  if (caption.length > CROSS_POST_SCAN_LENGTH) {
    // Most of a long caption never reaches the key. Read its start, and the
    // whole of it only when the start is mostly markup.
    const head = normaliseCaption(exactCaptionHead(caption));
    if (head.length > CROSS_POST_TEXT_PREFIX_LENGTH) {
      return head.slice(0, CROSS_POST_TEXT_PREFIX_LENGTH);
    }
  }
  return normaliseCaption(caption).slice(0, CROSS_POST_TEXT_PREFIX_LENGTH);
}

function liveAt(post: CrossPostCandidate): number {
  const value = post.publishedAt ?? post.createdAt;
  return value ? new Date(value).getTime() : Number.NaN;
}

/**
 * The native posts' go-live times, grouped by caption key. A network post can
 * only be a twin of the posts in its own group, so the window is checked
 * there and every caption is normalised once.
 */
function groupLiveTimesByKey(
  natives: readonly CrossPostCandidate[],
): Map<string, number[]> {
  const groups = new Map<string, number[]>();
  for (const native of natives) {
    const key = crossPostTextKey(native.description);
    const at = liveAt(native);
    if (!key || !Number.isFinite(at)) continue;
    const group = groups.get(key);
    if (group) group.push(at);
    else groups.set(key, [at]);
  }
  return groups;
}

function isWithinWindow(
  liveTimes: readonly number[] | undefined,
  post: CrossPostCandidate,
): boolean {
  if (!liveTimes) return false;
  const at = liveAt(post);
  if (!Number.isFinite(at)) return false;
  return liveTimes.some((time) => Math.abs(time - at) <= CROSS_POST_WINDOW_MS);
}

/** The network posts that are copies of one of the native posts. */
export function findCrossPostIds(
  natives: readonly CrossPostCandidate[],
  networkPosts: readonly CrossPostCandidate[],
): string[] {
  const groups = groupLiveTimesByKey(natives);
  if (groups.size === 0) return [];
  return networkPosts
    .filter((post) =>
      isWithinWindow(groups.get(crossPostTextKey(post.description)), post),
    )
    .map((post) => post.id);
}

/** Where a native post also went live, one link per network. */
export function listCrossPosts(
  native: CrossPostCandidate,
  networkPosts: readonly CrossPostCandidate[],
): PublicCrossPost[] {
  const byPlatform = new Map<string, PublicCrossPost>();
  const nativeKey = crossPostTextKey(native.description);
  const nativeLiveTimes = groupLiveTimesByKey([native]).get(nativeKey);
  if (!nativeLiveTimes) return [];
  for (const post of networkPosts) {
    if (!post.platform || !post.url || byPlatform.has(post.platform)) {
      continue;
    }
    if (
      crossPostTextKey(post.description) === nativeKey &&
      isWithinWindow(nativeLiveTimes, post)
    ) {
      byPlatform.set(post.platform, { platform: post.platform, url: post.url });
    }
  }
  return [...byPlatform.values()];
}
