import { SocialSourcePlatform } from './source-collector.enum';

/**
 * A single post extracted from a pasted platform URL.
 *
 * Only the platform, post identifier, and (when the URL carries it) the
 * author handle are extracted — the raw URL is never fetched server-side,
 * so unknown hosts can never trigger a request (SSRF guard by construction).
 */
export interface SocialPostUrlReference {
  platform: SocialSourcePlatform;
  /** Platform-native post identifier (tweet id, IG shortcode, TikTok video id). */
  postId: string;
  /** Author handle when the URL format includes it (X, TikTok, some IG URLs). */
  authorHandle: string | null;
  /** The original pasted URL (trimmed), kept as provenance. */
  url: string;
}

const TWITTER_HOSTS = new Set(['x.com', 'twitter.com', 'mobile.twitter.com']);
const INSTAGRAM_HOSTS = new Set(['instagram.com']);
const TIKTOK_HOSTS = new Set(['tiktok.com']);
const YOUTUBE_HOSTS = new Set(['youtube.com', 'm.youtube.com']);
const YOUTUBE_SHORT_HOSTS = new Set(['youtu.be']);
const LINKEDIN_HOSTS = new Set(['linkedin.com']);

const YOUTUBE_VIDEO_ID = /^[\w-]{6,}$/;
const LINKEDIN_ACTIVITY_ID = /-(?:activity|ugcPost|share)-(\d+)/;

/** Read one query-string parameter without the URL global (see above). */
function readQueryParam(input: string, key: string): string | undefined {
  const match = new RegExp(`[?&]${key}=([^&#]+)`).exec(input);
  return match ? decodeURIComponent(match[1]) : undefined;
}

const INSTAGRAM_POST_SEGMENTS = new Set(['p', 'reel', 'reels', 'tv']);

/**
 * Environment-agnostic host + path extraction (this package compiles without
 * DOM/Node libs, so the URL global is unavailable). Credentials and ports are
 * stripped before the host is compared against the platform allowlists.
 */
function extractHostAndPath(
  input: string,
): { host: string; segments: string[] } | null {
  const match = /^https?:\/\/([^/?#]+)((?:\/[^?#]*)?)/i.exec(input);
  if (!match) {
    return null;
  }

  const authority = match[1];
  const hostWithPort = authority.includes('@')
    ? authority.slice(authority.lastIndexOf('@') + 1)
    : authority;
  const host = hostWithPort
    .replace(/:\d+$/, '')
    .replace(/\.$/, '')
    .toLowerCase()
    .replace(/^www\./, '');
  if (!host) {
    return null;
  }

  const segments = (match[2] ?? '').split('/').filter(Boolean);
  return { host, segments };
}

function cleanHandle(segment: string | undefined): string | null {
  const handle = segment?.replace(/^@/, '').trim().toLowerCase();
  return handle ? handle : null;
}

/**
 * Parse a pasted URL into a single-post reference, or return null when the
 * input is not a recognizable X / Instagram / TikTok post URL.
 *
 * Profile URLs, plain handles, unknown hosts, and malformed input all return
 * null so callers can fall back to account-follow handling — but a URL that
 * contains a post identifier always resolves here first, which is what
 * prevents the silent "followed the whole account" degradation.
 */
export function parseSocialPostUrl(
  input: string,
): SocialPostUrlReference | null {
  const trimmed = input.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    return null;
  }

  const parsed = extractHostAndPath(trimmed);
  if (!parsed) {
    return null;
  }
  const { host, segments } = parsed;

  if (TWITTER_HOSTS.has(host)) {
    // x.com/{handle}/status/{id} · x.com/i/web/status/{id}
    const statusIndex = segments.findIndex(
      (segment) => segment === 'status' || segment === 'statuses',
    );
    const postId = statusIndex >= 0 ? segments[statusIndex + 1] : undefined;
    if (!postId || !/^\d+$/.test(postId)) {
      return null;
    }
    const author = statusIndex === 1 ? cleanHandle(segments[0]) : null;
    return {
      authorHandle: author === 'i' ? null : author,
      platform: SocialSourcePlatform.TWITTER,
      postId,
      url: trimmed,
    };
  }

  if (INSTAGRAM_HOSTS.has(host)) {
    // instagram.com/p/{code} · instagram.com/reel/{code} · instagram.com/{user}/p/{code}
    const markerIndex = segments.findIndex((segment) =>
      INSTAGRAM_POST_SEGMENTS.has(segment),
    );
    if (markerIndex < 0 || markerIndex > 1) {
      return null;
    }
    const postId = segments[markerIndex + 1];
    if (!postId || !/^[\w-]+$/.test(postId)) {
      return null;
    }
    return {
      authorHandle: markerIndex === 1 ? cleanHandle(segments[0]) : null,
      platform: SocialSourcePlatform.INSTAGRAM,
      postId,
      url: trimmed,
    };
  }

  if (YOUTUBE_HOSTS.has(host) || YOUTUBE_SHORT_HOSTS.has(host)) {
    // youtube.com/watch?v={id} · youtube.com/shorts/{id} · youtu.be/{id}
    const postId = YOUTUBE_SHORT_HOSTS.has(host)
      ? segments[0]
      : segments[0] === 'watch'
        ? readQueryParam(trimmed, 'v')
        : segments[0] === 'shorts' || segments[0] === 'live'
          ? segments[1]
          : undefined;
    if (!postId || !YOUTUBE_VIDEO_ID.test(postId)) {
      return null;
    }
    return {
      authorHandle: null,
      platform: SocialSourcePlatform.YOUTUBE,
      postId,
      url: trimmed,
    };
  }

  if (LINKEDIN_HOSTS.has(host)) {
    // linkedin.com/posts/{author}-{slug}-activity-{id}-xxxx
    // linkedin.com/feed/update/urn:li:activity:{id}
    if (segments[0] === 'posts' && segments[1]) {
      const match = LINKEDIN_ACTIVITY_ID.exec(segments[1]);
      if (!match) {
        return null;
      }
      const authorSlug = segments[1].split('_')[0];
      return {
        authorHandle:
          authorSlug && authorSlug !== segments[1]
            ? cleanHandle(authorSlug)
            : null,
        platform: SocialSourcePlatform.LINKEDIN,
        postId: `urn:li:activity:${match[1]}`,
        url: trimmed,
      };
    }
    if (segments[0] === 'feed' && segments[1] === 'update' && segments[2]) {
      const urn = decodeURIComponent(segments[2]);
      if (!/^urn:li:(activity|share|ugcPost):\d+$/.test(urn)) {
        return null;
      }
      return {
        authorHandle: null,
        platform: SocialSourcePlatform.LINKEDIN,
        postId: urn,
        url: trimmed,
      };
    }
    return null;
  }

  if (TIKTOK_HOSTS.has(host)) {
    // tiktok.com/@{handle}/video/{id} · tiktok.com/@{handle}/photo/{id}
    const [author, kind, postId] = segments;
    if (
      !author?.startsWith('@') ||
      (kind !== 'video' && kind !== 'photo') ||
      !postId ||
      !/^\d+$/.test(postId)
    ) {
      return null;
    }
    return {
      authorHandle: cleanHandle(author),
      platform: SocialSourcePlatform.TIKTOK,
      postId,
      url: trimmed,
    };
  }

  return null;
}
