import { createPageMetadataWithCanonical } from '@helpers/media/metadata/page-metadata.helper';
import AboutContent from '@public/about/about-content';

export const generateMetadata = createPageMetadataWithCanonical(
  'About',
  'Genfeed is an AI-powered content generation platform built for creators, agencies, and marketers. Discover how we help businesses create professional content at scale.',
  '/about',
);

export default function AboutPage() {
  return <AboutContent />;
}
