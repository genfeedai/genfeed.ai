import type { SocialMediaSource } from '@genfeedai/contracts/interfaces';
import { isHostOrSubdomain } from '../utils/host.util';

const YOUTUBE_SHORTS_EMBED_OR_LIVE_PATH_PATTERN =
  /^\/(?:shorts|embed|live)\/([^/]+)/;
const YOUTUBE_VIDEO_ID_PATTERN = /^[\w-]{11}$/;

export function getSafeExternalUrl(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

export function getSocialMediaSource(
  item: SocialMediaSource,
  interactive = true,
) {
  const thumbnail = getSafeExternalUrl(item.thumbnailUrl);
  const media = getSafeExternalUrl(item.mediaUrl);
  const source = getSafeExternalUrl(item.sourceUrl);
  let embedUrl: string | null = null;
  let directUrl: string | null = null;
  if (item.contentType === 'video') {
    for (const candidate of [media, source]) {
      if (!candidate) continue;
      const url = new URL(candidate);
      const host = url.hostname;
      if (
        isHostOrSubdomain(host, 'youtube.com') ||
        host === 'youtu.be' ||
        isHostOrSubdomain(host, 'youtube-nocookie.com')
      ) {
        const id =
          host === 'youtu.be'
            ? url.pathname.split('/')[1]
            : url.searchParams.get('v') ||
              url.pathname.match(
                YOUTUBE_SHORTS_EMBED_OR_LIVE_PATH_PATTERN,
              )?.[1];
        if (id && YOUTUBE_VIDEO_ID_PATTERN.test(id))
          embedUrl = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=${interactive ? 0 : 1}&playsinline=1&controls=${interactive ? 1 : 0}&rel=0`;
      } else if (
        candidate === media &&
        ![
          'tiktok.com',
          'instagram.com',
          'facebook.com',
          'x.com',
          'twitter.com',
          'linkedin.com',
          'reddit.com',
          'pinterest.com',
        ].some((domain) => isHostOrSubdomain(host, domain))
      ) {
        directUrl = candidate;
      }
    }
  }
  return {
    directUrl,
    embedUrl,
    sourceUrl: source,
    thumbnail: thumbnail || (item.contentType !== 'video' ? media : null),
  };
}

/**
 * TikTok and Instagram pages have no playable file in the trend data. The
 * server saves the clip for these two on first play, so the player asks for it
 * instead of embedding the platform's page.
 */
export function isPlaybackSourceUrl(value: string | null | undefined): boolean {
  const safe = getSafeExternalUrl(value);
  if (!safe) return false;
  const host = new URL(safe).hostname;
  return (
    isHostOrSubdomain(host, 'tiktok.com') ||
    isHostOrSubdomain(host, 'instagram.com')
  );
}
