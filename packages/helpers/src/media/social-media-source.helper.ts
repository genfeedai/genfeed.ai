import type { SocialMediaSource } from '@genfeedai/contracts/interfaces';
import { isHostOrSubdomain } from '../utils/host.util';

const YOUTUBE_SHORTS_EMBED_OR_LIVE_PATH_PATTERN =
  /^\/(?:shorts|embed|live)\/([^/]+)/;
const YOUTUBE_VIDEO_ID_PATTERN = /^[\w-]{11}$/;
const TIKTOK_VIDEO_PATH_PATTERN = /\/video\/(\d{8,25})(?:[/?]|$)/;
const INSTAGRAM_POST_PATH_PATTERN =
  /^\/(?:[\w.]+\/)?(reel|reels|p|tv)\/([\w-]+)/;

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
      } else if (interactive && isHostOrSubdomain(host, 'tiktok.com')) {
        // The platform's own player: playback stays on TikTok, nothing is copied.
        const id = url.pathname.match(TIKTOK_VIDEO_PATH_PATTERN)?.[1];
        if (id) embedUrl = `https://www.tiktok.com/player/v1/${id}?rel=0`;
      } else if (interactive && isHostOrSubdomain(host, 'instagram.com')) {
        const post = url.pathname.match(INSTAGRAM_POST_PATH_PATTERN);
        if (post)
          embedUrl = `https://www.instagram.com/${post[1] === 'reels' ? 'reel' : post[1]}/${post[2]}/embed`;
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
