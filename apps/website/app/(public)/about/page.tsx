import AboutContent from '@public/about/about-content';
import { createPageMetadataWithCanonical } from '@web-components/og/marketing-metadata';

export const generateMetadata = createPageMetadataWithCanonical(
  'About Genfeed: The Open-Source Content Agent',
  'Genfeed is an open-source content agent that makes on-brand videos, images and posts for creators, agencies and founders, to grow their audience and their revenue.',
  '/about',
);

export default function AboutPage() {
  return <AboutContent />;
}
