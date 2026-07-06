import { cdnAsset } from '../cdn/cdn.helper';

export const metadata = {
  cards: {
    // Absolute CDN URL — social crawlers (OG/Twitter) fetch this directly.
    // A site-relative path here resolves against metadataBase (the site
    // domain) where the file does not exist.
    default: cdnAsset('/assets/cards/default.jpg'),
  },
  description:
    'AI-powered content generation platform for your business. Create professional videos, images, and marketing materials at scale with autonomous AI agents.',
  keywords: ['genfeed', 'genfeed.ai', 'publisher', 'studio', 'storyboard'],
  name: 'Genfeed.ai',
  url: 'https://genfeed.ai',
};
