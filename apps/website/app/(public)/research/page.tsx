import { createPageMetadataWithCanonical } from '@helpers/media/metadata/page-metadata.helper';
import ResearchContent from '@public/research/research-content';

export const generateMetadata = createPageMetadataWithCanonical(
  'Research',
  'Discover trending content and hooks, track competitor social accounts, and study winning ad creative. Turn any trend into a ready brief in one click.',
  '/research',
);

export default function Research() {
  return <ResearchContent />;
}
