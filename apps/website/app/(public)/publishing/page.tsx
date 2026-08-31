import { createPageMetadataWithCanonical } from '@helpers/media/metadata/page-metadata.helper';
import PublishingContent from '@public/publishing/publishing-content';

export const generateMetadata = createPageMetadataWithCanonical(
  'Publishing: Post to 10+ Platforms',
  'Schedule and publish AI content to 10+ social platforms from one dashboard: X, LinkedIn, Instagram, TikTok, YouTube, Facebook, Reddit, and more.',
  '/publishing',
);

export default function Publishing() {
  return <PublishingContent />;
}
