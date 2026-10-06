const WEBSITE_URL = 'https://genfeed.ai';

export const metadata = {
  cards: {
    // The website composes the headline over versioned CDN artwork.
    // Keep this absolute: consumers may have a different metadataBase.
    default: `${WEBSITE_URL}/og`,
  },
  // Shared product description for marketing metadata, copy and agent discovery.
  description:
    'Genfeed is an open-source content agent. Create on-brand videos, images and posts, then review and publish to your connected channels.',
  keywords: [
    'genfeed',
    'genfeed.ai',
    'AI content studio',
    'AI content generation',
    'AI content agent',
    'content marketing platform',
    'AI video generator',
  ],
  name: 'Genfeed.ai',
  url: WEBSITE_URL,
};
