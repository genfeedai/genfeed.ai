import { getSafeExternalUrl } from '@pages/trends/shared/safe-external-url';
import type { DiscoveryDeskItem } from '@props/trends/discovery-desk.props';

function isHost(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

export function getDeskMediaSource(item: DiscoveryDeskItem) {
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
          embedUrl = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&mute=1&playsinline=1&controls=0&rel=0`;
      } else if (isHost(host, 'tiktok.com')) {
        const id = url.pathname.match(/\/(?:video|player\/v1)\/(\d+)/)?.[1];
        if (id)
          embedUrl = `https://www.tiktok.com/player/v1/${id}?autoplay=1&muted=1&loop=1&controls=0&description=0&music_info=0`;
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
    thumbnail: thumbnail || (item.contentType !== 'video' ? media : null),
  };
}
