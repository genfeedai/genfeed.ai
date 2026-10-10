import type { SocialMediaSource } from '@genfeedai/contracts/interfaces';

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

function isHost(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
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
        isHost(host, 'youtube.com') ||
        host === 'youtu.be' ||
        isHost(host, 'youtube-nocookie.com')
      ) {
        const id =
          host === 'youtu.be'
            ? url.pathname.split('/')[1]
            : url.searchParams.get('v') ||
              url.pathname.match(/^\/(?:shorts|embed|live)\/([^/]+)/)?.[1];
        if (id && /^[\w-]{11}$/.test(id))
          embedUrl = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=${interactive ? 0 : 1}&playsinline=1&controls=${interactive ? 1 : 0}&rel=0`;
      } else if (isHost(host, 'tiktok.com')) {
        const id = url.pathname.match(/\/(?:video|player\/v1)\/(\d+)/)?.[1];
        if (id)
          embedUrl = `https://www.tiktok.com/player/v1/${id}?autoplay=1&muted=${interactive ? 0 : 1}&loop=${interactive ? 0 : 1}&controls=${interactive ? 1 : 0}&description=0&music_info=0`;
      } else if (
        candidate === media &&
        ![
          'instagram.com',
          'facebook.com',
          'x.com',
          'twitter.com',
          'linkedin.com',
          'reddit.com',
          'pinterest.com',
        ].some((domain) => isHost(host, domain))
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
