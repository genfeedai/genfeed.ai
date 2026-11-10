import FeaturesPageContent from '@public/features/features-page';
import { createPageMetadataWithCanonical } from '@web-components/og/marketing-metadata';

export const generateMetadata = createPageMetadataWithCanonical(
  'Features: Your Agent, Trends, Publishing, Analytics',
  'Run Genfeed from your own agent. Start from trends, create videos, images and posts, then publish and see what worked.',
  '/features',
);

export default function FeaturesPage() {
  return <FeaturesPageContent />;
}
