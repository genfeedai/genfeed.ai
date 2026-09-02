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
  if (/^https?:\/\//i.test(raw)) {
    return raw;
  }
  // Channel IDs are typically UC… and much longer than handles.
  if (/^UC[\w-]{20,}$/i.test(raw)) {
    return `https://www.youtube.com/channel/${raw}`;
  }
  const handle = raw.replace(/^@/, '');
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
    (/youtube\.com\//i.test(contentUrl) || /youtu\.be\//i.test(contentUrl))
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
  if (/^https?:\/\//i.test(id)) {
    return id;
  }
  return `https://www.youtube.com/watch?v=${id}`;
}
