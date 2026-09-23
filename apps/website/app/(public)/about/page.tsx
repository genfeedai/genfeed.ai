import { createPageMetadataWithCanonical } from '@helpers/media/metadata/page-metadata.helper';
import AboutContent from '@public/about/about-content';

export const generateMetadata = createPageMetadataWithCanonical(
  'About Genfeed: Open-Source AI Content Platform',
  'Genfeed is an open-source AI content platform that generates, publishes, and measures content for creators, agencies, and founders. Founded in 2026 by Vincent Tellier.',
  '/about',
);

export default function AboutPage() {
  return <AboutContent />;
}
