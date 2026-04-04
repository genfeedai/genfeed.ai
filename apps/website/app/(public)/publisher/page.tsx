import { createPageMetadataWithCanonical } from '@helpers/media/metadata/page-metadata.helper';
import PublisherContent from '@public/publisher/publisher-content';

export const generateMetadata = createPageMetadataWithCanonical(
  'Publisher',
  'Schedule and publish AI content across 10+ social platforms from one dashboard. X, LinkedIn, Instagram, TikTok, YouTube, Facebook, Pinterest, Reddit, Discord, and Twitch.',
  '/publisher',
);

export default function Publisher() {
  return <PublisherContent />;
}
