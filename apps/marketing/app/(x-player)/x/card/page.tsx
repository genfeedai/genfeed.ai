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
  // Next 16.4.1 requires streamUrl on twitter.players and always emits
  // twitter:player:stream. This page is HTML, so that tag is omitted.
  // twitter: null replaces the layout summary card.
  other: {
    'twitter:card': 'player',
    'twitter:creator': '@genfeedai',
    'twitter:creator:id': '1928229187782848512',
    'twitter:description': description,
    'twitter:image': image.url,
    'twitter:player': X_PLAYER_CARD_URL,
    'twitter:player:height': X_PLAYER_HEIGHT,
    'twitter:player:width': X_PLAYER_WIDTH,
    'twitter:site': '@genfeedai',
    'twitter:title': title,
  },
  title,
  twitter: null,
};

export default function XPlayerCardPage() {
  return <XPlayerCardContent />;
}
