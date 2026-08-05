import { createPageMetadataWithCanonical } from '@helpers/media/metadata/page-metadata.helper';
import AboutContent from '@public/about/about-content';

export const generateMetadata = createPageMetadataWithCanonical(
  'About Genfeed: The AI Content OS',
  'Genfeed is an AI content platform for creators, agencies, and marketers. See how we help teams produce professional content at scale.',
  '/about',
);

export default function AboutPage() {
  return <AboutContent />;
}
