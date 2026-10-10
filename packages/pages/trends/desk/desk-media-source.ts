import { getSocialMediaSource } from '@genfeedai/helpers/media/social-media-source.helper';
import type { DiscoveryDeskItem } from '@props/trends/discovery-desk.props';

export function getDeskMediaSource(item: DiscoveryDeskItem) {
  const { directUrl, embedUrl, thumbnail } = getSocialMediaSource(item, false);
  return { directUrl, embedUrl, thumbnail };
}
