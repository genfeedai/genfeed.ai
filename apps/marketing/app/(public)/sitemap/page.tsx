import SitemapContent from '@public/sitemap/sitemap-content';
import { createPageMetadataWithCanonical } from '@web-components/og/marketing-metadata';

export const generateMetadata = createPageMetadataWithCanonical(
  'Explore Genfeed Pages and Resources',
  'Every public page on genfeed.ai: product surfaces, the Genfeed Agent, use cases, comparisons, free tools, and company pages.',
  '/sitemap',
);

export default function Sitemap() {
  return <SitemapContent />;
}
