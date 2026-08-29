import { createPageMetadataWithCanonical } from '@helpers/media/metadata/page-metadata.helper';
import SitemapContent from '@public/sitemap/sitemap-content';

export const generateMetadata = createPageMetadataWithCanonical(
  'Sitemap',
  'Every public page on genfeed.ai: product surfaces, the Genfeed Agent, use cases, comparisons, free tools, and company pages.',
  '/sitemap',
);

export default function Sitemap() {
  return <SitemapContent />;
}
