import { cdnAsset } from '../cdn/cdn.helper';

export const metadata = {
  cards: {
    // Absolute CDN URL — social crawlers (OG/Twitter) fetch this directly.
    // A site-relative path here resolves against metadataBase (the site
    // domain) where the file does not exist.
    default: cdnAsset('/assets/cards/default.jpg'),
  },
  description:
    'The AI content studio. Generate on-brand images, video, ads, voice, and articles, then review, schedule, and publish everywhere from one workspace.',
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
  url: 'https://genfeed.ai',
};
