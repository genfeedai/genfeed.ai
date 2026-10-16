import { getMarketingOgImage } from '@data/marketing-og.data';
import {
  X_PLAYER_CARD_PATH,
  X_PLAYER_CARD_URL,
  X_PLAYER_HEIGHT,
  X_PLAYER_WIDTH,
} from '@data/x-player-card';
import { metadata as site } from '@helpers/media/metadata/metadata.helper';
import type { Metadata } from 'next';
import XPlayerCardContent from './content';

const title = site.name;
const description = site.description;
const image = getMarketingOgImage(X_PLAYER_CARD_PATH, title);

export const metadata: Metadata = {
  alternates: {
    canonical: X_PLAYER_CARD_URL,
  },
  description,
  openGraph: {
    description,
    images: [image],
    siteName: site.name,
    title,
    type: 'website',
    url: X_PLAYER_CARD_URL,
  },
  title,
  twitter: {
    card: 'player',
    creator: '@genfeedai',
    creatorId: '1928229187782848512',
    description,
    images: [image],
    players: {
      height: X_PLAYER_HEIGHT,
      playerUrl: X_PLAYER_CARD_URL,
      // Next 16.4.1 requires streamUrl and always emits twitter:player:stream.
      // This card is an HTML frame, so the stream URL is the same final page.
      streamUrl: X_PLAYER_CARD_URL,
      width: X_PLAYER_WIDTH,
    },
    site: '@genfeedai',
    title,
  },
};

export default function XPlayerCardPage() {
  return <XPlayerCardContent />;
}
