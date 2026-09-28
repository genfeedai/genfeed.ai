import { createPageMetadataWithCanonical } from '@helpers/media/metadata/page-metadata.helper';
import AboutContent from '@public/about/about-content';

export const generateMetadata = createPageMetadataWithCanonical(
  'About Genfeed: Open-Source AI Content Platform',
  'Genfeed is an open-source AI content platform for creators, agencies, and founders to generate, publish, and measure on-brand content.',
  '/about',
);

export default function AboutPage() {
  return <AboutContent />;
}
