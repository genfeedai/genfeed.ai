import FeaturesPageContent from '@public/features/features-page';
import { createPageMetadataWithCanonical } from '@web-components/og/marketing-metadata';

export const generateMetadata = createPageMetadataWithCanonical(
  'Features: Your Agent, Trends, Publishing, Analytics',
  'Run Genfeed from your own agent. Start from trends, draft and schedule posts, make video and images on the full connector, then see what worked.',
  '/features',
);

export default function FeaturesPage() {
  return <FeaturesPageContent />;
}
