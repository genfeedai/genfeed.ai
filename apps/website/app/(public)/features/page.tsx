import { createPageMetadataWithCanonical } from '@helpers/media/metadata/page-metadata.helper';
import FeaturesPageContent from '@public/features/features-page';

export const generateMetadata = createPageMetadataWithCanonical(
  'Features',
  'AI video generation, image creation, voice synthesis, multi-platform publishing, analytics, and brand kits. Everything you need to create content at scale.',
  '/features',
);

export default function FeaturesPage() {
  return <FeaturesPageContent />;
}
