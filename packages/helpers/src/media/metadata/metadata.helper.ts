import { cdnAsset } from '../cdn/cdn.helper';

export const metadata = {
  cards: {
    // Absolute CDN URL — social crawlers (OG/Twitter) fetch this directly.
    // A site-relative path here resolves against metadataBase (the site
    // domain) where the file does not exist.
    default: cdnAsset('/assets/cards/default.jpg'),
  },
  // Says what Genfeed is before it says what it has: "AI content studio" is a
  // category every competitor also claims, and it names no mechanism, output
  // or destination to a reader who arrived from a link.
  description:
    'Tell the Genfeed agent what you want. It makes the video, images, ads and posts, keeps them on brand, and schedules them to 20+ channels — with every output in review before it goes out.',
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
