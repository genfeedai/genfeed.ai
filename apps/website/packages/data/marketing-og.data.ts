import { cdnAsset } from '@helpers/media/cdn/cdn.helper';

export const MARKETING_OG_SIZE = { height: 630, width: 1200 };

// Artwork carries branding only. Copy edits are rendered by the OG routes.
export const MARKETING_OG_CARDS = {
  default: {
    artwork: null,
    headline: ['Create', 'Publish', 'Grow'],
    headlineFontSize: 104,
    headlineTop: 134,
    headlineWidth: 480,
  },
  x: {
    artwork: cdnAsset('/assets/cards/marketing/social-growth-20260930/x.jpg'),
    headline: ['Grow on X'],
    headlineFontSize: 108,
    headlineTop: 190,
    headlineWidth: 600,
  },
  linkedin: {
    artwork: cdnAsset(
      '/assets/cards/marketing/social-growth-20260930/linkedin.jpg',
    ),
    headline: ['Grow on', 'LinkedIn'],
    headlineFontSize: 94,
    headlineTop: 144,
    headlineWidth: 540,
  },
  instagram: {
    artwork: cdnAsset(
      '/assets/cards/marketing/social-growth-20260930/instagram.jpg',
    ),
    headline: ['Grow on', 'Instagram'],
    headlineFontSize: 94,
    headlineTop: 144,
    headlineWidth: 540,
  },
  tiktok: {
    artwork: cdnAsset(
      '/assets/cards/marketing/social-growth-20260930/tiktok.jpg',
    ),
    headline: ['Grow on', 'TikTok'],
    headlineFontSize: 104,
    headlineTop: 144,
    headlineWidth: 540,
  },
  youtube: {
    artwork: cdnAsset(
      '/assets/cards/marketing/social-growth-20260930/youtube.jpg',
    ),
    headline: ['Grow on', 'YouTube'],
    headlineFontSize: 104,
    headlineTop: 144,
    headlineWidth: 540,
  },
  threads: {
    artwork: cdnAsset(
      '/assets/cards/marketing/social-growth-20260930/threads.jpg',
    ),
    headline: ['Grow on', 'Threads'],
    headlineFontSize: 104,
    headlineTop: 144,
    headlineWidth: 540,
  },
  facebook: {
    artwork: cdnAsset(
      '/assets/cards/marketing/social-growth-20260930/facebook.jpg',
    ),
    headline: ['Grow on', 'Facebook'],
    headlineFontSize: 94,
    headlineTop: 144,
    headlineWidth: 540,
  },
  pinterest: {
    artwork: cdnAsset(
      '/assets/cards/marketing/social-growth-20260930/pinterest.jpg',
    ),
    headline: ['Grow on', 'Pinterest'],
    headlineFontSize: 94,
    headlineTop: 144,
    headlineWidth: 540,
  },
} as const;

export type MarketingOgCard = keyof typeof MARKETING_OG_CARDS;

export function isMarketingOgCard(value: string): value is MarketingOgCard {
  return Object.hasOwn(MARKETING_OG_CARDS, value);
}
