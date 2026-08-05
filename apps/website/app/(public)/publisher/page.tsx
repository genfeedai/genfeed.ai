import { createPageMetadataWithCanonical } from '@helpers/media/metadata/page-metadata.helper';
import PublisherContent from '@public/publisher/publisher-content';

export const generateMetadata = createPageMetadataWithCanonical(
  'Publisher: Post to 10+ Platforms',
  'Schedule and publish AI content to 10+ social platforms from one dashboard: X, LinkedIn, Instagram, TikTok, YouTube, Facebook, Reddit, and more.',
  '/publisher',
);

export default function Publisher() {
  return <PublisherContent />;
}
