import { cdnAsset } from '@helpers/media/cdn/cdn.helper';

export const MARKETING_OG_SIZE = { height: 630, width: 1200 };

// Artwork carries branding only. Copy edits are rendered by the OG routes.
export const MARKETING_OG_CARDS = {
  default: {
    artwork: cdnAsset(
      '/assets/cards/marketing/founder-distribution-20260930.jpg',
    ),
    headline: ['You build.', 'We distribute.'],
  },
  x: {
    artwork: cdnAsset('/assets/cards/marketing/x-growth-20260930.jpg'),
    headline: ['Grow your', 'X audience'],
  },
} as const;
