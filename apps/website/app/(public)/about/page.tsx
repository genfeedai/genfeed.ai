import AboutContent from '@public/about/about-content';
import { createPageMetadataWithCanonical } from '@web-components/og/marketing-metadata';

export const generateMetadata = createPageMetadataWithCanonical(
  'About Genfeed: Open-Source AI Content Platform',
  'Genfeed is an open-source AI content platform for creators, agencies, and founders to generate, publish, and measure on-brand content.',
  '/about',
);

export default function AboutPage() {
  return <AboutContent />;
}
