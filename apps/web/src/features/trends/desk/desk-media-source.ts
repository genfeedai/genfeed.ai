import { getSocialMediaSource } from '@genfeedai/helpers/media/social-media-source.helper';
import type { DiscoveryDeskItem } from '@/features/trends/props/discovery-desk.props';

const YOUTUBE_EMBED_ID_PATTERN =
  /^https:\/\/www\.youtube-nocookie\.com\/embed\/([\w-]{11})\?/;
const VERTICAL_VIDEO_PLATFORMS = new Set(['instagram', 'tiktok']);
const VERTICAL_VIDEO_PATH_PATTERN = /\/(?:shorts|reels?)\//;

/**
 * A YouTube signal without a stored thumbnail still has one: the poster is
 * addressable from the video id the embed already resolved.
 */
function getYouTubePoster(embedUrl: string | null): string | null {
  const id = embedUrl?.match(YOUTUBE_EMBED_ID_PATTERN)?.[1];
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
}

export function getDeskMediaSource(item: DiscoveryDeskItem) {
  const { directUrl, embedUrl, thumbnail } = getSocialMediaSource(item, false);
  return {
    directUrl,
    embedUrl,
    thumbnail: thumbnail ?? getYouTubePoster(embedUrl),
  };
}

/**
 * The frame a masonry tile reserves for a signal's media. Video has a known
 * shape from its platform (Reels, TikTok and Shorts are vertical; the rest
 * are landscape), so the tile never jumps when the poster loads. Images
 * return null and take the picture's own ratio once it loads.
 */
export function getDeskMediaAspectRatio(
  item: DiscoveryDeskItem,
): string | null {
  if (item.contentType !== 'video') {
    return null;
  }
  const isVertical =
    VERTICAL_VIDEO_PLATFORMS.has(item.platform) ||
    [item.mediaUrl, item.sourceUrl].some(
      (url) => url !== undefined && VERTICAL_VIDEO_PATH_PATTERN.test(url),
    );
  return isVertical ? '9 / 16' : '16 / 9';
}

/**
 * A signal is shown as media when it has a picture or can play on hover.
 * Everything else, most tweets and Reddit or LinkedIn posts, is a text tile.
 */
export function hasDeskMedia(item: DiscoveryDeskItem): boolean {
  const { directUrl, embedUrl, thumbnail } = getDeskMediaSource(item);
  return Boolean(thumbnail || directUrl || embedUrl);
}
