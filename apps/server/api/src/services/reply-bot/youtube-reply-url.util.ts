const HTTP_PROTOCOL_PREFIX_PATTERN = /^https?:\/\//i;
const YOUTUBE_CHANNEL_ID_PATTERN = /^UC[\w-]{20,}$/i;
const LEADING_AT_SIGN_PATTERN = /^@/;
const YOUTUBE_HOST_PATTERN = /youtube\.com\//i;
const YOUTU_BE_HOST_PATTERN = /youtu\.be\//i;

/**
 * Pure YouTube URL normalizers for reply-inbox Apify/startUrl inputs.
 * SocialMonitor YouTube handlers forward strings as channel/video URLs — bare
 * UC… / handle / videoId strings do not resolve.
 */

/**
 * Build a channel start URL from channel id, handle, or full URL.
 */
export function toYouTubeChannelStartUrl(
  usernameOrChannelId: string | null | undefined,
): string {
  const raw = String(usernameOrChannelId ?? '').trim();
  if (!raw) {
    return '';
  }
  if (HTTP_PROTOCOL_PREFIX_PATTERN.test(raw)) {
    return raw;
  }
  // Channel IDs are typically UC… and much longer than handles.
  if (YOUTUBE_CHANNEL_ID_PATTERN.test(raw)) {
    return `https://www.youtube.com/channel/${raw}`;
  }
  const handle = raw.replace(LEADING_AT_SIGN_PATTERN, '');
  return `https://www.youtube.com/@${handle}`;
}

/**
 * Build a video watch URL from a content id and optional contentUrl.
 */
export function toYouTubeVideoUrl(post: {
  contentUrl?: string | null;
  id: string;
}): string {
  const contentUrl = String(post.contentUrl ?? '').trim();
  if (
    contentUrl &&
    (YOUTUBE_HOST_PATTERN.test(contentUrl) ||
      YOUTU_BE_HOST_PATTERN.test(contentUrl))
  ) {
    return contentUrl;
  }

  // Prefer v= query from contentUrl if present.
  if (contentUrl) {
    try {
      const parsed = new URL(contentUrl);
      const v = parsed.searchParams.get('v');
      if (v) {
        return `https://www.youtube.com/watch?v=${v}`;
      }
    } catch {
      // fall through
    }
  }

  const id = String(post.id ?? '').trim();
  if (!id) {
    return '';
  }
  if (HTTP_PROTOCOL_PREFIX_PATTERN.test(id)) {
    return id;
  }
  return `https://www.youtube.com/watch?v=${id}`;
}
