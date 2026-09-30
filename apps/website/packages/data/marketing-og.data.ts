import { AGENT_CLIENT_CHANNEL_SLUGS } from '@data/agent-client-channels.data';
import { AGENT_CLIENT_SLUGS, getAgentClient } from '@data/agent-clients.data';
import { competitors } from '@data/competitors.data';
import { EDITORIAL_OG_ARTWORKS } from '@data/editorial-og.data';
import { getIntegrationBySlug } from '@data/integrations.data';
import { cdnAsset } from '@helpers/media/cdn/cdn.helper';
import { metadata } from '@helpers/media/metadata/metadata.helper';

export const MARKETING_OG_SIZE = { height: 630, width: 1200 };

// Artwork carries branding only. Copy edits are rendered by the OG routes.
const SOCIAL_OG_CARDS = {
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

export interface MarketingOgDefinition {
  artwork: string | null;
  headline: readonly string[];
  headlineFontSize: number;
  headlineTop: number;
  headlineWidth: number;
}

function editorialCard(
  id: string,
  headline: readonly string[],
): MarketingOgDefinition {
  const longest = Math.max(...headline.map((line) => line.length));
  return {
    artwork: cdnAsset(
      `/assets/cards/marketing/founder-20260930/${id}-artwork.jpg`,
    ),
    headline,
    headlineFontSize: longest > 16 ? 74 : longest > 13 ? 84 : 96,
    headlineTop: 44,
    headlineWidth: 550,
  };
}

export const MARKETING_OG_CARDS: Record<string, MarketingOgDefinition> = {
  ...SOCIAL_OG_CARDS,
  ...Object.fromEntries(
    Object.entries(EDITORIAL_OG_ARTWORKS).map(([id, card]) => [
      id,
      editorialCard(id, card.headline),
    ]),
  ),
};

export const MARKETING_OG_PATHS: Record<string, string> = Object.fromEntries(
  Object.entries(EDITORIAL_OG_ARTWORKS)
    .filter(([id]) => id !== 'default')
    .map(([id, card]) => [card.route, id]),
);

for (const id of Object.keys(SOCIAL_OG_CARDS).filter(
  (id) => id !== 'default',
)) {
  MARKETING_OG_PATHS[`/${id}`] = id;
  MARKETING_OG_PATHS[`/integrations/${id === 'x' ? 'x-twitter' : id}`] = id;
}

for (const slug of AGENT_CLIENT_SLUGS) {
  const client = getAgentClient(slug);
  for (const channel of AGENT_CLIENT_CHANNEL_SLUGS) {
    const integration = getIntegrationBySlug(channel);
    if (!integration) continue;
    const id = `${slug}--${channel}`;
    const headline = [
      client.name === 'Meta Muse' ? 'Muse' : client.name,
      `on ${integration.name}`,
    ];
    MARKETING_OG_CARDS[id] = {
      ...editorialCard(slug, headline),
      headlineFontSize:
        Math.max(...headline.map((line) => line.length)) > 11 ? 74 : 84,
    };
    MARKETING_OG_PATHS[`/${slug}/${channel}`] = id;
  }
}

for (const competitor of competitors) {
  const id = `vs--${competitor.slug}`;
  MARKETING_OG_CARDS[id] = editorialCard('vs', ['Genfeed vs', competitor.name]);
  MARKETING_OG_PATHS[`/vs/${competitor.slug}`] = id;
}

export type MarketingOgCard = keyof typeof MARKETING_OG_CARDS;

export function isMarketingOgCard(value: string): value is MarketingOgCard {
  return Object.hasOwn(MARKETING_OG_CARDS, value);
}

export function getMarketingOgImage(path: string, alt: string) {
  const normalized = path.length > 1 ? path.replace(/\/$/, '') : path;
  const id = MARKETING_OG_PATHS[normalized] ?? 'default';
  return {
    alt,
    ...MARKETING_OG_SIZE,
    type: 'image/png',
    url: id === 'default' ? metadata.cards.default : `${metadata.url}/og/${id}`,
  };
}
