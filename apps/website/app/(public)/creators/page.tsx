import { createPageMetadataWithCanonical } from '@helpers/media/metadata/page-metadata.helper';
import CreatorsContent from '@public/creators/creators-content';

export const generateMetadata = createPageMetadataWithCanonical(
  'For Creators',
  'AI tools that help solo creators compete with agencies. Create more, edit less. Generate professional videos, images, and content at scale.',
  '/creators',
);

export default function Creators() {
  return <CreatorsContent />;
}
