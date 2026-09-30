import FeaturesPageContent from '@public/features/features-page';
import { createPageMetadataWithCanonical } from '@web-components/og/marketing-metadata';

export const generateMetadata = createPageMetadataWithCanonical(
  'Features: The AI Content Platform',
  'AI video generation, image creation, voice synthesis, multi-platform publishing, analytics, and brand kits. Everything you need to create content at scale.',
  '/features',
);

export default function FeaturesPage() {
  return <FeaturesPageContent />;
}
