const WEBSITE_URL = 'https://genfeed.ai';

export const metadata = {
  cards: {
    // The website composes the headline over versioned CDN artwork.
    // Keep this absolute: consumers may have a different metadataBase.
    default: `${WEBSITE_URL}/og`,
  },
  // Says what Genfeed is before it says what it has: "AI content studio" is a
  // category every competitor also claims, and it names no mechanism, output
  // or destination to a reader who arrived from a link.
  description:
    'Create on-brand videos, images, ads, and posts with Genfeed, review every draft, and schedule approved content across more than 20 channels.',
  keywords: [
    'genfeed',
    'genfeed.ai',
    'AI content studio',
    'AI content generation',
    'social media publishing',
    'content marketing platform',
    'AI video generator',
  ],
  name: 'Genfeed.ai',
  url: WEBSITE_URL,
};
