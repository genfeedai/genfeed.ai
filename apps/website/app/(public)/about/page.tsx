import { metadata } from '@helpers/media/metadata/metadata.helper';
import AboutContent from '@public/about/about-content';
import { createPageMetadataWithCanonical } from '@web-components/og/marketing-metadata';

export const generateMetadata = createPageMetadataWithCanonical(
  'About Genfeed: The Open-Source Content Agent',
  metadata.description,
  '/about',
);

export default function AboutPage() {
  return <AboutContent />;
}
